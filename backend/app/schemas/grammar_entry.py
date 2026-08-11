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
    # Both stored, unlike kanji/vocab romaji — see the comment on
    # GrammarEntry.pattern_romaji. Both are multi-word Japanese text and
    # need hand-authored word segmentation a character-level pass can't
    # supply, so both are authored content rather than a cache.
    pattern_romaji: str | None
    example_romaji: str | None
    category: str
    jlpt_level: str
    status: ContentStatus
    source: ContentSource
    created_at: datetime
