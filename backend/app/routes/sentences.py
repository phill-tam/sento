from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.grammar_entry import GrammarEntry
from app.models.kanji_entry import KanjiEntry
from app.models.vocab_entry import VocabEntry
from app.schemas.sentence_generate import (
    GenerateSentencesRequest,
    GenerateSentencesResponse,
    SentenceGenerationError,
    SourceItemRef,
)
from app.services.sentence_generation_service import (
    SentenceGenerationFailedError,
    SentenceGenerationRateLimitExceeded,
    generate_sentences,
)

router = APIRouter(prefix="/sentences", tags=["sentences"])

# Maps a source_item_ref's line_id to its content model and a formatter
# that turns one row into a short prompt-ready text snippet. Assumes
# line_id values "kanji" | "vocab" | "grammar", matching the three
# existing route prefixes — flag if the frontend's contentLines.js uses
# different identifiers, this mapping will need to change to match.
_LINE_RESOLVERS: dict[str, tuple[type, callable]] = {
    "kanji": (KanjiEntry, lambda e: f"{e.character} ({e.meaning_en})"),
    "vocab": (VocabEntry, lambda e: f"{e.word} ({e.meaning_en})"),
    "grammar": (GrammarEntry, lambda e: f"{e.pattern} ({e.meaning_en})"),
}


def _resolve_source_items(db: Session, refs: list[SourceItemRef]) -> list[str]:
    """Resolves line_id/item_id pairs to real content text for the AI
    prompt — the generation service must never receive opaque IDs.
    404s on any unknown line_id or missing row, same as every other
    single-entity lookup in this codebase.
    """
    snippets: list[str] = []
    for ref in refs:
        resolver = _LINE_RESOLVERS.get(ref.line_id)
        if resolver is None:
            raise HTTPException(status_code=404, detail=f"unknown line_id: {ref.line_id}")

        model, formatter = resolver
        entry = db.get(model, ref.item_id)
        if entry is None:
            raise HTTPException(
                status_code=404,
                detail=f"{ref.line_id} entry not found: {ref.item_id}",
            )
        snippets.append(formatter(entry))

    return snippets


@router.post("/generate", response_model=GenerateSentencesResponse)
def generate_sentences_endpoint(
    payload: GenerateSentencesRequest,
    db: Annotated[Session, Depends(get_db)],
) -> GenerateSentencesResponse:
    resolved_items = _resolve_source_items(db, payload.source_item_refs)

    try:
        candidates = generate_sentences(resolved_items, payload.count, payload.nuance)
    except SentenceGenerationRateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail=SentenceGenerationError(detail=str(exc)).model_dump(),
        ) from exc
    except SentenceGenerationFailedError as exc:
        raise HTTPException(status_code=502, detail=f"sentence generation failed: {exc}") from exc

    return GenerateSentencesResponse(candidates=candidates)