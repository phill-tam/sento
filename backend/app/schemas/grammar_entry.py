from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.content_status import ContentSource, ContentStatus


class GrammarEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pattern: str
    meaning_en: str
    example_jp: str | None
    example_reading: str | None
    example_en: str | None
    category: str
    jlpt_level: str
    status: ContentStatus
    source: ContentSource
    created_at: datetime