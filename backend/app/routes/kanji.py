from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.content_status import ContentSource, ContentStatus
from app.models.kanji_entry import KanjiEntry
from app.schemas.content_status_update import ContentStatusUpdate
from app.schemas.content_upload import BatchUploadResponse
from app.schemas.kanji_entry import KanjiEntryRead
from app.services.content_upload_service import RowValidationError, process_csv_upload

router = APIRouter(prefix="/kanji", tags=["kanji"])


def _parse_kanji_row(raw_row: dict[str, str]) -> KanjiEntry:
    """Builds a KanjiEntry from one CSV row. Required: character, meaning_en,
    category. Everything else (onyomi/kunyomi/compound fields) is optional —
    blank string in the CSV becomes None, not an empty string in the DB."""
    character = raw_row.get("character", "").strip()
    meaning_en = raw_row.get("meaning_en", "").strip()
    category = raw_row.get("category", "").strip()

    if not character or not meaning_en or not category:
        raise RowValidationError(
            "missing required field(s): character, meaning_en, category"
        )

    def optional(field: str) -> str | None:
        value = raw_row.get(field, "").strip()
        return value or None

    return KanjiEntry(
        character=character,
        meaning_en=meaning_en,
        onyomi=optional("onyomi"),
        kunyomi=optional("kunyomi"),
        compound_word=optional("compound_word"),
        compound_reading=optional("compound_reading"),
        compound_meaning_en=optional("compound_meaning_en"),
        category=category,
        jlpt_level=raw_row.get("jlpt_level", "N5").strip() or "N5",
        status=ContentStatus.DRAFT,
        source=ContentSource.MANUAL,
    )


@router.post("/upload", response_model=BatchUploadResponse)
async def upload_kanji_csv(
    file: Annotated[UploadFile, File()],
    db: Annotated[Session, Depends(get_db)],
) -> BatchUploadResponse:
    csv_bytes = await file.read()
    return process_csv_upload(db, csv_bytes, _parse_kanji_row)


@router.get("", response_model=list[KanjiEntryRead])
def get_kanji(
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str | None, Query()] = None,
    status: Annotated[ContentStatus | Literal["all"], Query()] = ContentStatus.APPROVED,
) -> list[KanjiEntry]:
    stmt = select(KanjiEntry)
    if status != "all":
        stmt = stmt.where(KanjiEntry.status == status)
    if category is not None:
        stmt = stmt.where(KanjiEntry.category == category)
    return list(db.scalars(stmt))


@router.patch("/{entry_id}/status", response_model=KanjiEntryRead)
def update_kanji_status(
    entry_id: UUID,
    payload: ContentStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> KanjiEntry:
    entry = db.get(KanjiEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="kanji entry not found")
    entry.status = payload.status
    db.commit()
    db.refresh(entry)
    return entry