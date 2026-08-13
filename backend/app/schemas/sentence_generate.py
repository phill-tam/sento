from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.sentence_entry import GeneratedSentenceRead, SourceItemRef


class GenerateSentencesRequest(BaseModel):
    """Request body for POST .../sentences/generate."""

    source_item_refs: list[SourceItemRef]
    count: int = Field(ge=1, le=3)
    nuance: str | None = None


class GeneratedSentenceCandidate(BaseModel):
    """A single ephemeral candidate from one generation round.

    Deliberately has no id/folder_id/created_at — candidates aren't
    persisted until the user clicks Save (POST .../sentences).
    """

    jp_text: str
    reading: str
    # Optional so a provider that ignores the romaji instruction degrades
    # to a sentence without it, rather than raising
    # AiProviderFailedError and discarding an entire round of
    # otherwise-valid output. The frontend already renders romaji
    # conditionally.
    romaji: str | None = None
    meaning_en: str


class GenerateSentencesResponse(BaseModel):
    candidates: list[GeneratedSentenceCandidate]


class SentenceGenerationError(BaseModel):
    """Body shape for the distinct rate/usage-limit error response.

    Used as the `detail` payload of a 429 HTTPException in the generation
    route (Step 5) — lets the frontend branch on `error` to show the
    dedicated limit notice instead of a generic failure message.
    """

    error: str = "rate_limit_exceeded"
    detail: str


class SentenceSaveItem(BaseModel):
    """One kept candidate being persisted, as part of a save batch."""

    jp_text: str
    reading: str
    # Optional for the same reason as on the candidate, and additionally
    # so a client saving a pre-epic-009 candidate still round-trips.
    romaji: str | None = None
    meaning_en: str
    source_item_refs: list[SourceItemRef] = []


class SaveSentencesRequest(BaseModel):
    """Request body for POST .../sentences — persists all kept
    candidates from a session in one call."""

    sentences: list[SentenceSaveItem]
    folder_id: UUID | None = None


class SaveSentencesResponse(BaseModel):
    saved: list[GeneratedSentenceRead]