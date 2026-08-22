"""Atomic occurrence counting under an opaque key, inside one window.

The mechanism half of epic 016 (ADR 022). It counts; it does not decide.
What a key means, how big a limit should be, which window applies and
what a caller is told when refused all live in the policy layer —
`ai_quota_service.py` today, possibly `POST /leaderboard` later (ADR 021
deferred that question here). Nothing feature-specific belongs in this
module, and the test for whether something does is simple: if it names a
device, an endpoint, or a budget, it is policy.

Every operation is a single SQL statement, which is the entire reason
this is a database helper rather than a counter in application code. The
naive shape — SELECT the count, compare it to the limit, UPDATE — has a
race in the gap between the read and the write: two simultaneous requests
both read 9, both write 10, and one call is served free. That window
cannot be closed in Python without a lock this project has nowhere to
put, so the increment and the limit test happen together, inside the
database, in one round trip.
"""

from datetime import date

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.usage_counter import UsageCounter


def check_and_increment(db: Session, *, key: str, limit: int, window_start: date) -> bool:
    """Counts one occurrence if doing so stays within `limit`.

    Returns True when the occurrence was allowed and counted, False when
    the limit was already reached and nothing was written. The count is
    never incremented past the limit and then walked back, so a refused
    call leaves no trace to reconcile.

    The `WHERE` on the conflict branch is what makes that true atomically:
    on a collision Postgres re-reads the existing row and applies the
    update only if it is still under the limit, so the check and the
    increment cannot be separated by another transaction. A refused call
    updates no row and returns nothing.

    Commits before returning, deliberately (ADR 022). Holding the row
    lock inside the caller's transaction would be tidier, but the caller
    is about to make a multi-second AI provider call, and every other
    request wanting the same counter would queue behind it.
    """
    if limit <= 0:
        # The conflict branch's WHERE only runs on collision, so the
        # very first call of a window would insert count=1 and be
        # allowed however small the limit was. A zero or negative budget
        # means "nothing is permitted", and that has to be answered
        # before the statement, not by it.
        return False

    statement = (
        insert(UsageCounter)
        .values(key=key, window_start=window_start, count=1)
        .on_conflict_do_update(
            index_elements=["key", "window_start"],
            set_={"count": UsageCounter.count + 1},
            where=UsageCounter.count < limit,
        )
        .returning(UsageCounter.count)
    )

    counted = db.execute(statement).scalar_one_or_none()
    db.commit()

    return counted is not None


def refund(db: Session, *, key: str, window_start: date) -> None:
    """Gives one counted occurrence back.

    For a charge that turned out to buy nothing — a provider rate limit
    that consumed no quota, or a reservation invalidated by a later check
    in the same request (ADR 022 uses this for both). Not for an ordinary
    failure: quota is spent by the attempt, so a call that reached the
    provider and failed has still cost something.

    Never drives a counter below zero, and does nothing at all if the row
    does not exist — a refund for something that was never charged is a
    caller bug, but making it a no-op keeps it safe to put in an `except`
    branch that may run before the charge did.
    """
    statement = (
        update(UsageCounter)
        .where(
            UsageCounter.key == key,
            UsageCounter.window_start == window_start,
            UsageCounter.count > 0,
        )
        .values(count=UsageCounter.count - 1)
    )

    db.execute(statement)
    db.commit()
