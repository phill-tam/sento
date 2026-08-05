from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.sentence_folder import SentenceFolder


class GeneratedSentence(Base):
    """A saved, AI-generated practice sentence kept by the user.

    Ephemeral (not-yet-saved) candidates from a generation round never hit
    this table — they live only in the frontend's useSentenceGenerator
    state until the user clicks Save. Only kept sentences are persisted.
    """

    __tablename__ = "generated_sentences"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    jp_text: Mapped[str] = mapped_column(Text, nullable=False)
    reading: Mapped[str] = mapped_column(Text, nullable=False)
    meaning_en: Mapped[str] = mapped_column(Text, nullable=False)

    # Nullable: a sentence saved with no folder chosen is treated as
    # "Uncategorized" by the service layer at save time (Step 5), not by
    # a magic FK value here.
    folder_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sentence_folders.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # [{line_id, item_id}] — which kanji/vocab/grammar entries informed
    # this sentence. Traceability only; no FK, since entries span three
    # separate tables (kanji/vocab/grammar) with no shared parent.
    source_item_refs: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    folder: Mapped["SentenceFolder | None"] = relationship(back_populates="sentences")