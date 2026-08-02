from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.content_status import ContentSource, ContentStatus


class KanjiEntry(Base):
    """A single N5 kanji entry authored via CSV upload or LLM suggestion.

    Kept as its own table rather than a shared `Item`-style model — the
    onyomi/kunyomi/compound-word fields below have no equivalent in
    VocabEntry or GrammarEntry, so a shared wide table would carry
    always-NULL columns per row depending on content type.
    """

    __tablename__ = "kanji_entries"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    character: Mapped[str] = mapped_column(String, nullable=False)
    meaning_en: Mapped[str] = mapped_column(String, nullable=False)
    onyomi: Mapped[str | None] = mapped_column(String, nullable=True)
    kunyomi: Mapped[str | None] = mapped_column(String, nullable=True)
    compound_word: Mapped[str | None] = mapped_column(String, nullable=True)
    compound_reading: Mapped[str | None] = mapped_column(String, nullable=True)
    compound_meaning_en: Mapped[str | None] = mapped_column(String, nullable=True)

    category: Mapped[str] = mapped_column(String, index=True, nullable=False)
    jlpt_level: Mapped[str] = mapped_column(String, nullable=False, default="N5", server_default="N5")

    status: Mapped[ContentStatus] = mapped_column(
        SAEnum(ContentStatus, name="content_status"),
        nullable=False,
        default=ContentStatus.DRAFT,
    )
    source: Mapped[ContentSource] = mapped_column(
        SAEnum(ContentSource, name="content_source"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )