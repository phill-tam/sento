"""Quota behaviour through the real request path of both AI endpoints.

Deliberately route-level rather than service-level. The service's own
rules are covered by test_usage_counter.py; what cannot be checked there
is the part that only exists as an *arrangement* — that the charge sits
after ref resolution, that a refund actually runs in the except branch,
and that a rejected call never reaches a provider. Those are properties
of the route body, so they are asserted by making requests.

Every test stubs the provider. Without it these calls reach a live SDK
and a real key; see conftest.stub_ai_provider.
"""

import json
from collections.abc import Callable
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.models.usage_counter import UsageCounter
from app.schemas.sentence_entry import SourceItemRef
from app.services.ai_provider import AiProviderFailedError, AiProviderRateLimitExceeded
from app.services.ai_quota_service import current_window

GENERATE_PAYLOAD = json.dumps(
    [{"jp_text": "空を見た。", "reading": "そらをみた。", "meaning_en": "I looked at the sky."}]
)
GRADE_PAYLOAD = json.dumps(
    [
        {
            "pair_id": "p1",
            "verdict": "correct",
            "words": [{"used": True, "sense_ok": True}, {"used": True, "sense_ok": True}],
            "feedback": "ok",
        }
    ]
)


def counter(db: Session, key: str) -> int:
    row = db.get(UsageCounter, (key, current_window()))
    return 0 if row is None else row.count


def generate_body(ref: SourceItemRef) -> dict:
    return {
        "source_item_refs": [{"line_id": ref.line_id, "item_id": str(ref.item_id)}],
        "count": 1,
    }


def grade_body(first: SourceItemRef, second: SourceItemRef) -> dict:
    return {
        "answers": [
            {
                "pair_id": "p1",
                "words": [
                    {"line_id": first.line_id, "item_id": str(first.item_id)},
                    {"line_id": second.line_id, "item_id": str(second.item_id)},
                ],
                "answer": "I looked at the sky while running.",
            }
        ]
    }


@pytest.fixture()
def device() -> str:
    """A fresh id per test, so counters can't be inherited from another."""
    return str(uuid4())


class TestUnderBudget:
    def test_a_first_call_succeeds_and_charges_both_counters(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        record = stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")

        response = client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": device},
        )

        assert response.status_code == 200
        assert record["calls"] == 1
        assert counter(db_session, f"generate:device:{device}") == 1
        assert counter(db_session, "generate:global") == 1

    def test_grading_meters_its_own_endpoint_not_generation(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        """The two budgets are separate (ADR 022) — heavy generator use
        must not refuse a Word Pairs run."""
        stub_ai_provider(payload=GRADE_PAYLOAD)
        first, second = seed_content("kanji"), seed_content("vocab")

        client.post(
            "/api/v1/pair-writing/grade",
            json=grade_body(first, second),
            headers={"X-Device-Id": device},
        )

        assert counter(db_session, f"grade:device:{device}") == 1
        assert counter(db_session, f"generate:device:{device}") == 0


class TestDeviceBudgetExhausted:
    def test_refuses_with_the_actionable_message_and_never_calls_the_provider(
        self,
        client: TestClient,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        monkeypatch: pytest.MonkeyPatch,
        device: str,
    ) -> None:
        monkeypatch.setattr(settings, "generate_device_daily_limit", 1)
        record = stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")
        body = generate_body(ref)
        headers = {"X-Device-Id": device}

        client.post("/api/v1/sentences/generate", json=body, headers=headers)
        refused = client.post("/api/v1/sentences/generate", json=body, headers=headers)

        assert refused.status_code == 429
        detail = refused.json()["detail"]
        # The same code the two AI endpoints already return, so api.js
        # raises RateLimitError and both hooks render this message with
        # no frontend change (ADR 022).
        assert detail["error"] == "rate_limit_exceeded"
        assert "today's 1 sentence generations" in detail["detail"]
        assert "00:00 UTC" in detail["detail"]
        # A refused call is refused *before* spending anything.
        assert record["calls"] == 1

    def test_the_message_follows_the_setting(
        self,
        client: TestClient,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        monkeypatch: pytest.MonkeyPatch,
        device: str,
    ) -> None:
        """Built from the limit rather than written out, so a .env change
        can't leave a stale number in a sentence a learner reads."""
        monkeypatch.setattr(settings, "grade_device_daily_limit", 3)
        stub_ai_provider(payload=GRADE_PAYLOAD)
        first, second = seed_content("kanji"), seed_content("vocab")
        body = grade_body(first, second)
        headers = {"X-Device-Id": device}

        for _ in range(3):
            client.post("/api/v1/pair-writing/grade", json=body, headers=headers)
        refused = client.post("/api/v1/pair-writing/grade", json=body, headers=headers)

        assert "today's 3 graded quizzes" in refused.json()["detail"]["detail"]


class TestGlobalCapExhausted:
    def test_refuses_without_blaming_the_learner_and_refunds_their_slot(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        monkeypatch: pytest.MonkeyPatch,
        device: str,
    ) -> None:
        """Two properties at once, and the refund is the subtle one: the
        device counter is incremented before the global check, so a
        global rejection has to hand it back or a learner who did nothing
        wrong quietly loses budget."""
        monkeypatch.setattr(settings, "generate_global_daily_limit", 1)
        stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")

        # Someone else uses up the shared cap.
        client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": str(uuid4())},
        )

        refused = client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": device},
        )

        assert refused.status_code == 429
        message = refused.json()["detail"]["detail"]
        assert "shared daily AI budget" in message
        # Must not tell a learner who has generated nothing that they hit
        # their own limit.
        assert "today's" not in message
        assert counter(db_session, f"generate:device:{device}") == 0

    def test_the_device_message_wins_when_both_are_exhausted(
        self,
        client: TestClient,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        monkeypatch: pytest.MonkeyPatch,
        device: str,
    ) -> None:
        """Device counter is checked first so the learner gets the
        message they can act on (ADR 022)."""
        monkeypatch.setattr(settings, "generate_device_daily_limit", 1)
        monkeypatch.setattr(settings, "generate_global_daily_limit", 1)
        stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")
        body = generate_body(ref)
        headers = {"X-Device-Id": device}

        client.post("/api/v1/sentences/generate", json=body, headers=headers)
        refused = client.post("/api/v1/sentences/generate", json=body, headers=headers)

        assert "today's" in refused.json()["detail"]["detail"]


class TestAnonymousCallers:
    def test_callers_without_a_header_share_one_budget(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Omitting the header must be the worst option, not a bypass —
        one device-sized budget split between everyone who tries it."""
        monkeypatch.setattr(settings, "generate_device_daily_limit", 1)
        stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")
        body = generate_body(ref)

        first = client.post("/api/v1/sentences/generate", json=body)
        second = client.post("/api/v1/sentences/generate", json=body)

        assert first.status_code == 200
        assert second.status_code == 429
        assert counter(db_session, "generate:device:anonymous") == 1

    def test_a_malformed_device_id_is_treated_as_absent(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
    ) -> None:
        """Otherwise arbitrary text becomes a counter key, which is both
        unlimited free budgets and unbounded rows in usage_counters."""
        stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")

        client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": "not-a-uuid"},
        )

        assert counter(db_session, "generate:device:anonymous") == 1
        assert counter(db_session, "generate:device:not-a-uuid") == 0

    def test_case_differences_in_one_id_share_a_budget(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        stub_ai_provider(payload=GENERATE_PAYLOAD)
        ref = seed_content("kanji")
        body = generate_body(ref)

        client.post("/api/v1/sentences/generate", json=body, headers={"X-Device-Id": device})
        client.post(
            "/api/v1/sentences/generate", json=body, headers={"X-Device-Id": device.upper()}
        )

        assert counter(db_session, f"generate:device:{device}") == 2


class TestRefunds:
    def test_a_provider_rate_limit_gives_the_slot_back(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        """The one knowably-free failure — the provider refused before
        generating, so the attempt bought nothing (ADR 022)."""
        stub_ai_provider(raises=AiProviderRateLimitExceeded("upstream slow down"))
        ref = seed_content("kanji")

        response = client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": device},
        )

        assert response.status_code == 429
        assert counter(db_session, f"generate:device:{device}") == 0

    def test_a_provider_failure_does_not_give_the_slot_back(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        """Quota is spent by the attempt. Refunding here would hand
        unlimited billable attempts to anyone whose input reliably fails
        to parse — the hole that 'count successes only' opens."""
        stub_ai_provider(raises=AiProviderFailedError("mangled response"))
        ref = seed_content("kanji")

        response = client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": device},
        )

        assert response.status_code == 502
        assert counter(db_session, f"generate:device:{device}") == 1

    def test_unparseable_output_is_also_not_refunded(
        self,
        client: TestClient,
        db_session: Session,
        seed_content: Callable[..., SourceItemRef],
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        """Reaches AiProviderFailedError through the service's own parse
        rather than a raised stub — the response really was generated."""
        stub_ai_provider(payload="sorry, I can't help with that")
        ref = seed_content("kanji")

        client.post(
            "/api/v1/sentences/generate",
            json=generate_body(ref),
            headers={"X-Device-Id": device},
        )

        assert counter(db_session, f"generate:device:{device}") == 1


class TestUnresolvableRefs:
    def test_a_404_costs_nothing_and_never_reaches_the_provider(
        self,
        client: TestClient,
        db_session: Session,
        stub_ai_provider: Callable[..., dict],
        device: str,
    ) -> None:
        """Why the charge is in the route body rather than a decorator
        dependency: resolution runs first, and a client error must not
        spend a learner's budget (ADR 022)."""
        record = stub_ai_provider(payload=GENERATE_PAYLOAD)

        response = client.post(
            "/api/v1/sentences/generate",
            json={
                "source_item_refs": [{"line_id": "kanji", "item_id": str(uuid4())}],
                "count": 1,
            },
            headers={"X-Device-Id": device},
        )

        assert response.status_code == 404
        assert record["calls"] == 0
        assert counter(db_session, f"generate:device:{device}") == 0
        assert counter(db_session, "generate:global") == 0
