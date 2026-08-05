from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.sentence_entry import GeneratedSentence


class SentenceFolder(Base):
    """A flat, user-editable folder for organizing AI-generated sentences.

    Unlike the kanji/vocab/grammar `category` string field, this is a real
    persisted structure the user creates/renames/deletes — not a fixed
    taxonomy. No nesting, per the epic doc's "flat, not a tree" decision.
    """

    __tablename__ = "sentence_folders"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    name: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # NOTE: intentionally no cascade="all, delete-orphan" here. Folder
    # deletion is hard-blocked at the service layer while non-empty (409,
    # no override) — a delete-orphan cascade would silently mass-delete
    # sentences if that rule were ever bypassed via a raw ORM delete. The
    # FK's ondelete="RESTRICT" (see GeneratedSentence.folder_id) backs the
    # same invariant at the DB level instead.
    sentences: Mapped[list["GeneratedSentence"]] = relationship(back_populates="folder")