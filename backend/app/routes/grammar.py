from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.content_status import ContentSource, ContentStatus
from app.models.grammar_entry import GrammarEntry
from app.schemas.content_status_update import ContentStatusUpdate
from app.schemas.content_upload import BatchUploadResponse
from app.schemas.grammar_entry import GrammarEntryRead
from app.services.content_upload_service import RowValidationError, process_csv_upload

# Split by access level — see the note in routes/kanji.py (ADR 012).
router = APIRouter(prefix="/grammar", tags=["grammar"])
admin_router = APIRouter(prefix="/grammar", tags=["grammar-admin"])


def _parse_grammar_row(raw_row: dict[str, str]) -> GrammarEntry:
    """Builds a GrammarEntry from one CSV row.

    Required: pattern, meaning_en, category. Everything else is optional
    and static/curated per the epic doc — a blank string becomes None,
    not an empty string.

    Optional columns: example_jp, example_reading, example_en,
    pattern_romaji, example_romaji, jlpt_level.

    **Grammar is the only line whose upload carries romaji columns.** Kanji
    and vocab romaji is computed from their readings when the row is read
    back (see the `*EntryRead` schemas), so their CSVs need no romaji
    column and gain nothing from one. Grammar can't do that: `pattern` has
    no separate reading to transliterate, and both it and `example_reading`
    are multi-word text needing word segmentation rather than
    transliteration — 74 of 96 seeded patterns disagree with a mechanical
    pass. See ADR 015.

    Both romaji columns are optional rather than required. A row is still
    perfectly valid content without them, and rejecting it outright would
    fail an otherwise-complete pattern over a support field. The cost is
    that an upload omitting them produces cards with no romaji line while
    their neighbours have one — visible now that romaji defaults on — so
    supply them when authoring.
    """
    pattern = raw_row.get("pattern", "").strip()
    meaning_en = raw_row.get("meaning_en", "").strip()
    category = raw_row.get("category", "").strip()

    if not pattern or not meaning_en or not category:
        raise RowValidationError(
            "missing required field(s): pattern, meaning_en, category"
        )

    def optional(field: str) -> str | None:
        value = raw_row.get(field, "").strip()
        return value or None

    return GrammarEntry(
        pattern=pattern,
        meaning_en=meaning_en,
        example_jp=optional("example_jp"),
        example_reading=optional("example_reading"),
        example_en=optional("example_en"),
        pattern_romaji=optional("pattern_romaji"),
        example_romaji=optional("example_romaji"),
        category=category,
        jlpt_level=raw_row.get("jlpt_level", "N5").strip() or "N5",
        status=ContentStatus.DRAFT,
        source=ContentSource.MANUAL,
    )


@admin_router.post("/upload", response_model=BatchUploadResponse)
async def upload_grammar_csv(
    file: Annotated[UploadFile, File()],
    db: Annotated[Session, Depends(get_db)],
) -> BatchUploadResponse:
    csv_bytes = await file.read()
    return process_csv_upload(db, csv_bytes, _parse_grammar_row)


@router.get("", response_model=list[GrammarEntryRead])
def get_grammar(
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str | None, Query()] = None,
    status: Annotated[ContentStatus | Literal["all"], Query()] = ContentStatus.APPROVED,
) -> list[GrammarEntry]:
    stmt = select(GrammarEntry)
    if status != "all":
        stmt = stmt.where(GrammarEntry.status == status)
    if category is not None:
        stmt = stmt.where(GrammarEntry.category == category)
    return list(db.scalars(stmt))


@admin_router.patch("/{entry_id}/status", response_model=GrammarEntryRead)
def update_grammar_status(
    entry_id: UUID,
    payload: ContentStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> GrammarEntry:
    entry = db.get(GrammarEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="grammar entry not found")
    entry.status = payload.status
    db.commit()
    db.refresh(entry)
    return entry