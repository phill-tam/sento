from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.sentence_entry import GeneratedSentence
from app.models.sentence_folder import SentenceFolder
from app.schemas.sentence_entry import GeneratedSentenceRead, SentenceRelocate
from app.schemas.sentence_generate import (
    GenerateSentencesRequest,
    GenerateSentencesResponse,
    SaveSentencesRequest,
    SaveSentencesResponse,
    SentenceGenerationError,
)
from app.services.ai_provider import (
    AiProviderFailedError,
    AiProviderRateLimitExceeded,
)
from app.services.content_resolver import resolve_source_items
from app.services.sentence_generation_service import generate_sentences

# Two routers, mounted independently — the same split kanji/vocab/grammar
# use for `router` vs `admin_router`, and for the same reason: what
# separates them is whether an unauthenticated caller reaching the
# endpoint is acceptable, not which feature they belong to.
#
# `router` is generation only. It has no persistence, the app cannot work
# without it, and it is mounted unconditionally.
router = APIRouter(prefix="/sentences", tags=["sentences"])

# `persistence_router` writes and reads the shared, unattributed
# generated_sentences table. Saved sentences moved into the browser in
# epic 013, so nothing calls these; they are mounted only where
# sentence_persistence_enabled says a stray caller is acceptable. Keep new
# persistence endpoints here and new generation endpoints on `router`.
persistence_router = APIRouter(prefix="/sentences", tags=["sentences"])


@router.post("/generate", response_model=GenerateSentencesResponse)
def generate_sentences_endpoint(
    payload: GenerateSentencesRequest,
    db: Annotated[Session, Depends(get_db)],
) -> GenerateSentencesResponse:
    resolved_items = resolve_source_items(db, payload.source_item_refs)

    try:
        candidates = generate_sentences(resolved_items, payload.count, payload.nuance)
    except AiProviderRateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail=SentenceGenerationError(detail=str(exc)).model_dump(),
        ) from exc
    except AiProviderFailedError as exc:
        raise HTTPException(status_code=502, detail=f"sentence generation failed: {exc}") from exc

    return GenerateSentencesResponse(candidates=candidates)


@persistence_router.post("", response_model=SaveSentencesResponse)
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
            romaji=item.romaji,
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


@persistence_router.get("", response_model=list[GeneratedSentenceRead])
def get_sentences(
    db: Annotated[Session, Depends(get_db)],
    folder_id: UUID | None = None,
) -> list[GeneratedSentence]:
    stmt = select(GeneratedSentence)
    if folder_id is not None:
        stmt = stmt.where(GeneratedSentence.folder_id == folder_id)
    return list(db.scalars(stmt))


@persistence_router.patch("/{sentence_id}", response_model=GeneratedSentenceRead)
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


@persistence_router.delete("/{sentence_id}", status_code=204)
def delete_sentence(
    sentence_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    entry = db.get(GeneratedSentence, sentence_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="sentence not found")
    db.delete(entry)
    db.commit()