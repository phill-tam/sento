from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SourceItemRef(BaseModel):
    """Which kanji/vocab/grammar entry informed a generated sentence.

    Shared shape between the generate request (source_item_refs picked on
    the Study page) and the persisted GeneratedSentence row (traceability,
    per the epic's "Planned Upgrades" — no FK, since line_id spans three
    separate source tables.
    """

    line_id: str
    item_id: UUID


class GeneratedSentenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    jp_text: str
    reading: str
    meaning_en: str
    folder_id: UUID | None
    source_item_refs: list[SourceItemRef]
    created_at: datetime


class SentenceRelocate(BaseModel):
    """Request body for PATCH .../sentences/{id} — moves a sentence to a
    different folder. folder_id=None relocates to Uncategorized."""

    folder_id: UUID | None