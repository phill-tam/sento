from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.content_status import ContentSource, ContentStatus


class VocabEntry(Base):
    """A single N5 vocabulary entry authored via CSV upload or LLM suggestion."""

    __tablename__ = "vocab_entries"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    word: Mapped[str] = mapped_column(String, nullable=False)
    reading: Mapped[str | None] = mapped_column(String, nullable=True)
    meaning_en: Mapped[str] = mapped_column(String, nullable=False)

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