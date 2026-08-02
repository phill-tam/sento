from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.content_status import ContentSource, ContentStatus


class KanjiEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    character: str
    meaning_en: str
    onyomi: str | None
    kunyomi: str | None
    compound_word: str | None
    compound_reading: str | None
    compound_meaning_en: str | None
    category: str
    jlpt_level: str
    status: ContentStatus
    source: ContentSource
    created_at: datetime