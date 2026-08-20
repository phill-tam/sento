from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.leaderboard_device import LeaderboardDevice


class LeaderboardQuizType(str, Enum):
    """Mirrors scoreStore.js's quizType. Scoped to this model alone,
    unlike ContentStatus/ContentSource — nothing else in the backend
    needs it, so it doesn't get its own shared module."""

    CHOICE = "choice"
    PAIRS = "pairs"


class LeaderboardRun(Base):
    """One submitted quiz or word-pairs run (epic 015, ADR 021).

    `id` is the run's own id — scoreStore.recordRun's
    crypto.randomUUID(), not server-generated (no `default=uuid4`, same
    deliberate deviation as LeaderboardDevice.id). This is what makes
    submission idempotent: the client resubmits its whole capped history
    on every sync and the service upserts by this id, so a replay or a
    resubmission of an already-stored run changes nothing. The server
    never stores or increments a running total — the leaderboard itself
    is `SUM(score) GROUP BY device_id` over this table, computed fresh
    on every read, not a column anywhere.
    """

    __tablename__ = "leaderboard_runs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    device_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("leaderboard_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    quiz_type: Mapped[LeaderboardQuizType] = mapped_column(
        SAEnum(LeaderboardQuizType, name="leaderboard_quiz_type"), nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)

    # ISO 8601 string from scoreStore's completedAt, parsed into a real
    # timestamp — not server-stamped, since it records when the run
    # itself finished, which can be well before the sync that submits it.
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    device: Mapped["LeaderboardDevice"] = relationship(back_populates="runs")
