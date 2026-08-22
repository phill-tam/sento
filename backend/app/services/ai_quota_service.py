"""Budgets, keys and messages for the two AI endpoints (epic 016, ADR 022).

The policy half. `usage_counter.py` counts things under a key and decides
nothing; everything a count *means* lives here — which keys exist, how
big each budget is, in which order the two are checked, and what a
learner is told when one is exhausted.

The split matters most at the point a third AI-backed feature arrives:
it adds a `MeteredEndpoint` here and nothing at all to the counter.

**This is a fairness mechanism, not a security boundary** (ADR 022,
following ADR 011's framing for the admin write gate). The device id is
client-supplied and free to re-mint, so this stops a learner
accidentally exhausting a shared budget and stops nobody deliberate. The
global cap is the part that bounds the bill.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.schemas.sentence_generate import SentenceGenerationError
from app.services.usage_counter import check_and_increment, refund

# Stands in for a device id that never arrived or didn't parse. Every
# such caller shares this one budget rather than being refused or waved
# through, which makes omitting the header the *worst* option available
# instead of a way around the limit — one device-sized budget split
# between everyone who tries it. Enforcement doesn't depend on clients
# cooperating (ADR 022).
ANONYMOUS_DEVICE = "anonymous"


@dataclass(frozen=True)
class MeteredEndpoint:
    """One endpoint's budget and the words for refusing a call.

    Messages are built from the limits rather than written out, so a
    `.env` change to a budget can't leave a stale number in a sentence a
    learner reads.
    """

    name: str
    device_limit: int
    global_limit: int
    unit_plural: str

    def device_key(self, device_id: str) -> str:
        return f"{self.name}:device:{device_id}"

    def global_key(self) -> str:
        return f"{self.name}:global"

    def device_exhausted_message(self) -> str:
        return (
            f"You've used today's {self.device_limit} {self.unit_plural}. "
            "Your budget resets at 00:00 UTC."
        )

    def global_exhausted_message(self) -> str:
        # Deliberately does not mention the caller's own usage. A learner
        # who generated twice today and hits this has done nothing wrong,
        # and the device message would tell them otherwise (ADR 022).
        return "Sento's shared daily AI budget is used up. Please try again tomorrow."


def generation_endpoint() -> MeteredEndpoint:
    """Read at call time, not at import, so a test overriding a setting
    doesn't need the module reloaded."""
    return MeteredEndpoint(
        name="generate",
        device_limit=settings.generate_device_daily_limit,
        global_limit=settings.generate_global_daily_limit,
        unit_plural="sentence generations",
    )


def grading_endpoint() -> MeteredEndpoint:
    return MeteredEndpoint(
        name="grade",
        device_limit=settings.grade_device_daily_limit,
        global_limit=settings.grade_global_daily_limit,
        unit_plural="graded quizzes",
    )


def current_window() -> date:
    """The UTC calendar day. Not a rolling window: the boundary burst it
    would close is nowhere near the weakest link here, since a fresh
    device id is one click away (ADR 022)."""
    return datetime.now(UTC).date()


def _rate_limited(message: str) -> HTTPException:
    """Reuses the existing rate-limit body shape rather than adding a new
    one. `api.js` turns `detail.error == "rate_limit_exceeded"` into
    RateLimitError, and both hooks render the message verbatim — so three
    different causes reach the learner as three different sentences with
    no frontend change at all (ADR 022).
    """
    return HTTPException(
        status_code=429,
        detail=SentenceGenerationError(detail=message).model_dump(),
    )


@dataclass(frozen=True)
class QuotaCharge:
    """A reservation that has been committed and may need giving back."""

    endpoint: MeteredEndpoint
    device_id: str
    window_start: date

    def refund(self, db: Session) -> None:
        """Returns the device's occurrence only.

        The global counter is deliberately not refunded on a provider
        rate limit: the call did reach the provider, and whether it cost
        anything is the provider's business, but the *device* budget
        exists to be fair to a learner whose attempt bought nothing. The
        one case that does refund both is a global-cap rejection, which
        never charged the global counter in the first place.
        """
        refund(db, key=self.endpoint.device_key(self.device_id), window_start=self.window_start)


def charge(db: Session, endpoint: MeteredEndpoint, device_id: str | None) -> QuotaCharge:
    """Reserves one call, or raises 429 with the reason.

    Device counter first, so that when both are exhausted the learner
    gets the message they can act on. A global rejection then hands back
    the device occurrence it just took — the request is not being served,
    so charging for it would quietly shrink the budget of someone who did
    nothing wrong.

    Called from the route body rather than a decorator dependency,
    deliberately: both routes resolve source refs first and 404 on
    unknown ones, and a request that never reaches the provider must not
    cost anything (ADR 022).
    """
    resolved_device = device_id or ANONYMOUS_DEVICE
    window_start = current_window()

    if not check_and_increment(
        db,
        key=endpoint.device_key(resolved_device),
        limit=endpoint.device_limit,
        window_start=window_start,
    ):
        raise _rate_limited(endpoint.device_exhausted_message())

    charged = QuotaCharge(endpoint=endpoint, device_id=resolved_device, window_start=window_start)

    if not check_and_increment(
        db,
        key=endpoint.global_key(),
        limit=endpoint.global_limit,
        window_start=window_start,
    ):
        charged.refund(db)
        raise _rate_limited(endpoint.global_exhausted_message())

    return charged
