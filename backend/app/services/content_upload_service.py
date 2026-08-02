import csv
import io
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.database.base import Base
from app.schemas.content_upload import BatchUploadResponse, UploadRowResult


class RowValidationError(Exception):
    """Raised by a row parser when a CSV row fails validation.

    Kept distinct from DB-level errors so the caller can tell
    "bad data" apart from "insert failed" if that distinction ever
    matters — right now both just produce an UploadRowResult, but
    they're different failure classes.
    """


def process_csv_upload[ModelT: Base](
    db: Session,
    csv_bytes: bytes,
    row_parser: Callable[[dict[str, str]], ModelT],
) -> BatchUploadResponse:
    """Parse a CSV file and insert rows independently, one savepoint per row.

    `row_parser` is supplied by each content line's route (kanji/vocab/
    grammar) — it knows that line's column names and builds the
    corresponding model instance, tagging source=MANUAL itself. This
    function only handles the shared mechanics: iterate rows, isolate
    failures, count outcomes, commit once at the end.

    Partial-success requires per-row savepoints (db.begin_nested()), not
    just a try/except around db.add(). Without a savepoint, a failed
    insert poisons the whole SQLAlchemy session — every row after the
    failure would raise InvalidRequestError, not just the bad one.
    """
    reader = csv.DictReader(io.StringIO(csv_bytes.decode("utf-8")))

    results: list[UploadRowResult] = []
    success_count = 0
    error_count = 0

    for row_number, raw_row in enumerate(reader, start=1):
        try:
            with db.begin_nested():
                entry = row_parser(raw_row)
                db.add(entry)
        except RowValidationError as exc:
            error_count += 1
            results.append(UploadRowResult(row=row_number, status="error", error=str(exc)))
            continue
        except Exception as exc:  # noqa: BLE001 — any DB-level failure (constraint, type coercion) must not abort the batch
            error_count += 1
            results.append(UploadRowResult(row=row_number, status="error", error=str(exc)))
            continue

        success_count += 1
        results.append(UploadRowResult(row=row_number, status="success", error=None))

    # Single commit outside the loop — see epic 002 ADR (commit strategy).
    # A crash mid-loop loses the whole batch; accepted trade-off for an
    # authoring tool where uploads are single, fast HTTP requests, not
    # long-running jobs.
    db.commit()

    return BatchUploadResponse(
        results=results,
        success_count=success_count,
        error_count=error_count,
    )