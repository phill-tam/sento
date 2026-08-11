"""Backfill grammar romaji and example readings onto already-seeded rows.

Run manually, after `alembic upgrade head`:

    uv run python -m app.seed_data.backfill_grammar_romaji

`seed_content.py` is idempotent by *skipping* rows that already exist by
natural key, which means it can create a row but never update one. Any
database seeded before epic 009 therefore keeps NULL `pattern_romaji`,
`example_romaji` and `example_reading` no matter how many times the seed
script is re-run. This script is the update path that closes that gap.

Only grammar needs it. Kanji and vocab romaji is computed at read time in
the `*EntryRead` schemas (ADR 015), so existing rows in those tables
return correct romaji with no database change at all.

**Fills NULLs only.** Every column is written through COALESCE, so a value
already present — including one a human corrected by hand — is left
untouched. That makes the script safe to re-run and safe to point at a
database whose content has diverged from the seed file.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.seed_data.grammar_seeds import GRAMMAR_SEED

_UPDATE = text(
    """
    UPDATE grammar_entries
       SET example_reading = COALESCE(example_reading, :example_reading),
           pattern_romaji  = COALESCE(pattern_romaji,  :pattern_romaji),
           example_romaji  = COALESCE(example_romaji,  :example_romaji)
     WHERE pattern = :pattern
    """
)


def backfill_grammar(db: Session) -> tuple[int, int]:
    """Returns (rows_matched, seed_patterns_absent_from_db)."""
    matched = 0
    absent = 0
    for row in GRAMMAR_SEED:
        result = db.execute(
            _UPDATE,
            {
                "pattern": row["pattern"],
                "example_reading": row.get("example_reading"),
                "pattern_romaji": row.get("pattern_romaji"),
                "example_romaji": row.get("example_romaji"),
            },
        )
        if result.rowcount:
            matched += result.rowcount
        else:
            absent += 1
            print(f"absent from db, skipped: {row['pattern']}")
    return matched, absent


def main() -> None:
    db = SessionLocal()
    try:
        matched, absent = backfill_grammar(db)
        db.commit()
        print(f"\nrows matched: {matched}")
        print(f"seed patterns not present in db: {absent}")

        filled = db.execute(
            text(
                "SELECT COUNT(*) FILTER (WHERE pattern_romaji IS NOT NULL),"
                "       COUNT(*) FILTER (WHERE example_reading IS NOT NULL),"
                "       COUNT(*) FILTER (WHERE example_romaji IS NOT NULL),"
                "       COUNT(*)"
                "  FROM grammar_entries"
            )
        ).one()
        print(
            f"after backfill — pattern_romaji: {filled[0]}/{filled[3]}, "
            f"example_reading: {filled[1]}/{filled[3]}, "
            f"example_romaji: {filled[2]}/{filled[3]}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
