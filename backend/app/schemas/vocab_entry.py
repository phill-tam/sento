from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.content_status import ContentSource, ContentStatus


class VocabEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    word: str
    reading: str | None
    meaning_en: str
    category: str
    jlpt_level: str
    status: ContentStatus
    source: ContentSource
    created_at: datetime