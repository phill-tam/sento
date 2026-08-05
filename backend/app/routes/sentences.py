from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.grammar_entry import GrammarEntry
from app.models.kanji_entry import KanjiEntry
from app.models.sentence_entry import GeneratedSentence
from app.models.sentence_folder import SentenceFolder
from app.models.vocab_entry import VocabEntry
from app.schemas.sentence_entry import GeneratedSentenceRead, SentenceRelocate
from app.schemas.sentence_generate import (
    GenerateSentencesRequest,
    GenerateSentencesResponse,
    SaveSentencesRequest,
    SaveSentencesResponse,
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


@router.post("", response_model=SaveSentencesResponse)
def save_sentences(
    payload: SaveSentencesRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SaveSentencesResponse:
    """Persists all currently-kept candidates from a generation session
    in one call. folder_id=None is a valid, permanent state — it means
    Uncategorized, not "pick a default folder" (see Step 5 decision log).
    """
    if payload.folder_id is not None:
        folder = db.get(SentenceFolder, payload.folder_id)
        if folder is None:
            raise HTTPException(status_code=404, detail="sentence folder not found")

    saved: list[GeneratedSentence] = []
    for item in payload.sentences:
        entry = GeneratedSentence(
            jp_text=item.jp_text,
            reading=item.reading,
            meaning_en=item.meaning_en,
            folder_id=payload.folder_id,
            source_item_refs=[ref.model_dump(mode="json") for ref in item.source_item_refs],
        )
        db.add(entry)
        saved.append(entry)

    db.commit()
    for entry in saved:
        db.refresh(entry)

    return SaveSentencesResponse(saved=[GeneratedSentenceRead.model_validate(e) for e in saved])


@router.get("", response_model=list[GeneratedSentenceRead])
def get_sentences(
    db: Annotated[Session, Depends(get_db)],
    folder_id: UUID | None = None,
) -> list[GeneratedSentence]:
    stmt = select(GeneratedSentence)
    if folder_id is not None:
        stmt = stmt.where(GeneratedSentence.folder_id == folder_id)
    return list(db.scalars(stmt))


@router.patch("/{sentence_id}", response_model=GeneratedSentenceRead)
def relocate_sentence(
    sentence_id: UUID,
    payload: SentenceRelocate,
    db: Annotated[Session, Depends(get_db)],
) -> GeneratedSentence:
    entry = db.get(GeneratedSentence, sentence_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="sentence not found")

    if payload.folder_id is not None:
        folder = db.get(SentenceFolder, payload.folder_id)
        if folder is None:
            raise HTTPException(status_code=404, detail="sentence folder not found")

    entry.folder_id = payload.folder_id
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{sentence_id}", status_code=204)
def delete_sentence(
    sentence_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    entry = db.get(GeneratedSentence, sentence_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="sentence not found")
    db.delete(entry)
    db.commit()