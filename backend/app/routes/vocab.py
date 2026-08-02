from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.content_status import ContentSource, ContentStatus
from app.models.vocab_entry import VocabEntry
from app.schemas.content_upload import BatchUploadResponse
from app.schemas.vocab_entry import VocabEntryRead
from app.services.content_upload_service import RowValidationError, process_csv_upload

router = APIRouter(prefix="/vocab", tags=["vocab"])


def _parse_vocab_row(raw_row: dict[str, str]) -> VocabEntry:
    """Builds a VocabEntry from one CSV row. Required: word, meaning_en,
    category. reading is optional — blank string becomes None."""
    word = raw_row.get("word", "").strip()
    meaning_en = raw_row.get("meaning_en", "").strip()
    category = raw_row.get("category", "").strip()

    if not word or not meaning_en or not category:
        raise RowValidationError(
            "missing required field(s): word, meaning_en, category"
        )

    reading = raw_row.get("reading", "").strip() or None

    return VocabEntry(
        word=word,
        reading=reading,
        meaning_en=meaning_en,
        category=category,
        jlpt_level=raw_row.get("jlpt_level", "N5").strip() or "N5",
        status=ContentStatus.DRAFT,
        source=ContentSource.MANUAL,
    )


@router.post("/upload", response_model=BatchUploadResponse)
async def upload_vocab_csv(
    file: Annotated[UploadFile, File()],
    db: Annotated[Session, Depends(get_db)],
) -> BatchUploadResponse:
    csv_bytes = await file.read()
    return process_csv_upload(db, csv_bytes, _parse_vocab_row)


@router.get("", response_model=list[VocabEntryRead])
def get_vocab(
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str | None, Query()] = None,
    status: Annotated[ContentStatus | Literal["all"], Query()] = ContentStatus.APPROVED,
) -> list[VocabEntry]:
    stmt = select(VocabEntry)
    if status != "all":
        stmt = stmt.where(VocabEntry.status == status)
    if category is not None:
        stmt = stmt.where(VocabEntry.category == category)
    return list(db.scalars(stmt))