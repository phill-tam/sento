from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.content_status import ContentSource, ContentStatus
from app.services.romaji import to_romaji


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

    # Computed rather than stored — onyomi/kunyomi/compound_reading
    # romanize mechanically with no exceptions across the seed set, so a
    # column would only be a cache of these three lines. Computing here
    # means a newly uploaded kanji gets romaji on its very next GET with
    # no migration and no upload-path change.
    @computed_field
    @property
    def onyomi_romaji(self) -> str | None:
        return to_romaji(self.onyomi)

    @computed_field
    @property
    def kunyomi_romaji(self) -> str | None:
        return to_romaji(self.kunyomi)

    @computed_field
    @property
    def compound_romaji(self) -> str | None:
        return to_romaji(self.compound_reading)
