from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.content_status import ContentSource, ContentStatus
from app.services.romaji import to_romaji


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

    # Computed, not stored — see KanjiEntryRead for why. Falls back to
    # `word` for kana-only entries (word already is the reading), which is
    # also where romaji.to_romaji's fixed-expression table catches the two
    # cases (こんにちは/こんばんは) mechanical transliteration gets wrong.
    @computed_field
    @property
    def romaji(self) -> str | None:
        return to_romaji(self.reading or self.word)
