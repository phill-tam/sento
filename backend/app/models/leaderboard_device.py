from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.leaderboard_run import LeaderboardRun


class LeaderboardDevice(Base):
    """One row per self-asserted client device (epic 015, ADR 021).

    `id` is the client-generated deviceId from identityStore.js, NOT a
    server-minted key — unlike every other model in this codebase, there
    is no `default=uuid4` here. There is no auth to mint an identity on
    the client's behalf, so the client's own id is the only one there
    is. It functions as a bearer credential in practice: whoever submits
    a given deviceId can rewrite that device's display_name and upsert
    its runs. See ADR 021's accepted-gaps list — this is a named,
    accepted gap, not an oversight.

    `display_name` is NOT NULL: the submit flow (phase 3) always sends
    one, and the service upserts it on every submission, so a rename is
    just resubmitting with a different name. No uniqueness constraint —
    ADR 021: names are labels, not identities, and a unique constraint
    would turn an ordinary localStorage clear into permanent,
    unrecoverable loss of a name with no proof of ownership to reclaim
    it.
    """

    __tablename__ = "leaderboard_devices"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    runs: Mapped[list["LeaderboardRun"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
