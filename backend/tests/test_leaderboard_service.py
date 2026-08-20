"""Coverage for the leaderboard service's business logic (epic 015,
ADR 021).

Every case here exists because a manual smoke test against a real
Postgres caught `result.rowcount` silently reporting -1 for the batch
ON CONFLICT DO NOTHING insert instead of the actual accepted count —
see the comment at the fix in leaderboard_service.py. That was the
warning that assumptions about this endpoint's DB-level behaviour need
verifying against real Postgres, not just plausible-looking code, which
is what these tests do via the db_session fixture rather than mocking
the database.
"""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.schemas.leaderboard import LeaderboardRunSubmission, SubmitLeaderboardRequest
from app.services.leaderboard_service import (
    _hash_device_id,
    get_leaderboard,
    submit_runs,
)


def make_run(**overrides) -> LeaderboardRunSubmission:
    defaults = {
        "id": uuid4(),
        "quiz_type": "choice",
        "score": 8,
        "total": 10,
        "completed_at": datetime.now(UTC),
    }
    return LeaderboardRunSubmission(**{**defaults, **overrides})


class TestHashing:
    def test_produces_a_four_character_hex_string(self):
        result = _hash_device_id(uuid4())

        assert len(result) == 4
        assert all(c in "0123456789abcdef" for c in result)

    def test_is_deterministic_for_the_same_id(self):
        device_id = uuid4()

        assert _hash_device_id(device_id) == _hash_device_id(device_id)

    def test_differs_for_different_ids(self):
        assert _hash_device_id(uuid4()) != _hash_device_id(uuid4())


class TestSubmitRuns:
    def test_first_submission_is_fully_accepted(self, db_session: Session):
        device_id = uuid4()
        payload = SubmitLeaderboardRequest(
            device_id=device_id, display_name="Phil", runs=[make_run(score=8, total=10)]
        )

        result = submit_runs(db_session, payload)

        assert result.accepted_runs == 1
        assert result.total_score == 8
        assert result.device_hash == _hash_device_id(device_id)

    def test_resubmitting_the_same_run_id_accepts_nothing_and_changes_nothing(
        self, db_session: Session
    ):
        device_id = uuid4()
        run = make_run(score=8, total=10)
        payload = SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[run])

        submit_runs(db_session, payload)
        result = submit_runs(db_session, payload)

        assert result.accepted_runs == 0
        assert result.total_score == 8

    def test_a_resubmission_under_the_same_id_cannot_overwrite_the_stored_score(
        self, db_session: Session
    ):
        """The scenario decision 3 (ADR 021) exists to prevent: a later
        submission — honest retry with a typo fixed, or a fabricated
        replay — must never change what an existing run id already
        recorded."""
        device_id = uuid4()
        run_id = uuid4()
        original = make_run(id=run_id, score=8, total=10)
        tampered = make_run(id=run_id, score=999, total=999)

        submit_runs(
            db_session,
            SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[original]),
        )
        result = submit_runs(
            db_session,
            SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[tampered]),
        )

        assert result.accepted_runs == 0
        assert result.total_score == 8

    def test_mixed_batch_accepts_only_the_new_run(self, db_session: Session):
        device_id = uuid4()
        existing = make_run(score=8, total=10)
        new = make_run(score=5, total=6)

        submit_runs(
            db_session,
            SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[existing]),
        )
        result = submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=device_id, display_name="Phil", runs=[existing, new]
            ),
        )

        assert result.accepted_runs == 1
        assert result.total_score == 13

    def test_a_resubmission_with_a_new_name_renames_the_device(self, db_session: Session):
        device_id = uuid4()

        submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=device_id, display_name="Phil", runs=[make_run(score=1, total=1)]
            ),
        )
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(device_id=device_id, display_name="Philip", runs=[]),
        )

        board = get_leaderboard(db_session)

        assert board.entries[0].display_name == "Philip"

    def test_an_empty_run_list_only_touches_the_device_row(self, db_session: Session):
        device_id = uuid4()
        payload = SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[])

        result = submit_runs(db_session, payload)

        assert result.accepted_runs == 0
        assert result.total_score == 0


class TestGetLeaderboard:
    def test_sums_scores_across_multiple_runs_for_one_device(self, db_session: Session):
        device_id = uuid4()
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=device_id,
                display_name="Phil",
                runs=[make_run(score=8, total=10), make_run(score=3, total=4)],
            ),
        )

        board = get_leaderboard(db_session)

        assert len(board.entries) == 1
        assert board.entries[0].total_score == 11

    def test_excludes_a_device_that_has_never_submitted_a_run(self, db_session: Session):
        device_id = uuid4()
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(device_id=device_id, display_name="Phil", runs=[]),
        )

        board = get_leaderboard(db_session)

        assert board.entries == []

    def test_never_exposes_the_raw_device_id(self, db_session: Session):
        """ADR 021: device_id is a bearer credential. Publishing any
        part of it on the public board — even via a field name a future
        change might add — is the exact mistake this ADR exists to
        prevent."""
        device_id = uuid4()
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=device_id, display_name="Phil", runs=[make_run()]
            ),
        )

        board = get_leaderboard(db_session)

        assert "device_id" not in type(board.entries[0]).model_fields
        assert str(device_id) not in board.model_dump_json()

    def test_orders_by_score_descending(self, db_session: Session):
        low, high = uuid4(), uuid4()
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=low, display_name="Low", runs=[make_run(score=1, total=10)]
            ),
        )
        submit_runs(
            db_session,
            SubmitLeaderboardRequest(
                device_id=high, display_name="High", runs=[make_run(score=9, total=10)]
            ),
        )

        board = get_leaderboard(db_session)

        assert [e.display_name for e in board.entries] == ["High", "Low"]
