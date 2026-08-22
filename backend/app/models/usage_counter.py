from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class UsageCounter(Base):
    """One tally of occurrences under a string key inside one window.

    Deliberately knows nothing about AI, devices, endpoints or budgets
    (ADR 022). `key` is an opaque string chosen by whatever policy layer
    is counting — `ai_quota_service` builds `generate:device:<uuid>` and
    `generate:global` — so a second feature wanting a counter needs no
    column here, only a key of its own. That is what lets ADR 021's
    deferred question (whether `POST /leaderboard` adopts this) be
    answered later without touching this model.

    The composite primary key is the mechanism, not just an index: it is
    what makes `INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET
    count = count + 1` a single atomic statement. A surrogate id with a
    unique constraint alongside would work identically for the conflict
    target, and would add a column nothing ever selects by.

    No timestamps. `window_start` already carries the only time this row
    has, including for retention (see ADR 022 — a hand-run delete of old
    windows, not a migration), and a counter is a tally rather than an
    entity with a history worth recording.
    """

    __tablename__ = "usage_counters"

    # Opaque to this layer on purpose — see the class docstring. Not an
    # enum and not a foreign key, because constraining it here would put
    # the policy layer's vocabulary into the mechanism.
    key: Mapped[str] = mapped_column(String, primary_key=True)

    # A date rather than a timestamp: windows are UTC calendar days
    # (ADR 022), so the value is the window's identity, not the moment
    # anything happened in it.
    window_start: Mapped[date] = mapped_column(Date, primary_key=True)

    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
