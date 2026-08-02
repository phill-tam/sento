from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.content_status import ContentSource, ContentStatus


class GrammarEntry(Base):
    """A single N5 grammar pattern entry authored via CSV upload or LLM suggestion.

    Example fields are static and curated by design (per the epic doc — not
    LLM-generated), which is why they're plain nullable Text columns rather
    than anything tied to the Sentence Generator's dynamic generation path.
    """

    __tablename__ = "grammar_entries"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    pattern: Mapped[str] = mapped_column(String, nullable=False)
    meaning_en: Mapped[str] = mapped_column(String, nullable=False)
    example_jp: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_reading: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_en: Mapped[str | None] = mapped_column(Text, nullable=True)

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