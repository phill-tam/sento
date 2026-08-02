from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.content_status import ContentSource, ContentStatus
from app.models.grammar_entry import GrammarEntry
from app.schemas.content_upload import BatchUploadResponse
from app.schemas.grammar_entry import GrammarEntryRead
from app.services.content_upload_service import RowValidationError, process_csv_upload

router = APIRouter(prefix="/grammar", tags=["grammar"])


def _parse_grammar_row(raw_row: dict[str, str]) -> GrammarEntry:
    """Builds a GrammarEntry from one CSV row. Required: pattern, meaning_en,
    category. Example fields are optional and static/curated per the epic
    doc — blank string becomes None, not an empty string."""
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
        category=category,
        jlpt_level=raw_row.get("jlpt_level", "N5").strip() or "N5",
        status=ContentStatus.DRAFT,
        source=ContentSource.MANUAL,
    )


@router.post("/upload", response_model=BatchUploadResponse)
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
) -> list[GrammarEntry]:
    stmt = select(GrammarEntry).where(GrammarEntry.status == ContentStatus.APPROVED)
    if category is not None:
        stmt = stmt.where(GrammarEntry.category == category)
    return list(db.scalars(stmt))