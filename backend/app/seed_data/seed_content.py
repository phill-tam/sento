"""Seed script for initial N5 content — Kanji, Vocabulary, Grammar.

Run manually (uv run python -m app.seed_data.seed_content), not part of
app boot or CI. Inserts a small, hand-curated set of real N5 content
directly as status=approved, source=manual — bypassing the CSV upload
/review flow entirely, since this is developer-authored data, not
uploaded-and-reviewed content (same reasoning epic 002 used for CSV
rows: a human curated it, so source=manual applies here too).

Idempotent: skips any entry that already exists by its natural key
(character / word / pattern), so re-running this script is always safe.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.content_status import ContentSource, ContentStatus
from app.models.grammar_entry import GrammarEntry
from app.models.kanji_entry import KanjiEntry
from app.models.vocab_entry import VocabEntry
from app.seed_data.grammar_seeds import GRAMMAR_SEED
from app.seed_data.kanji_seeds import KANJI_SEED
from app.seed_data.vocab_seeds import VOCAB_SEED


def seed_kanji(db: Session) -> None:
    for row in KANJI_SEED:
        exists = db.scalars(select(KanjiEntry).where(KanjiEntry.character == row["character"])).first()
        if exists:
            print(f"skip kanji: {row['character']} (already exists)")
            continue
        db.add(KanjiEntry(**row, jlpt_level="N5", status=ContentStatus.APPROVED, source=ContentSource.MANUAL))
        print(f"add kanji: {row['character']}")


def seed_vocab(db: Session) -> None:
    for row in VOCAB_SEED:
        exists = db.scalars(select(VocabEntry).where(VocabEntry.word == row["word"])).first()
        if exists:
            print(f"skip vocab: {row['word']} (already exists)")
            continue
        db.add(VocabEntry(**row, jlpt_level="N5", status=ContentStatus.APPROVED, source=ContentSource.MANUAL))
        print(f"add vocab: {row['word']}")


def seed_grammar(db: Session) -> None:
    for row in GRAMMAR_SEED:
        exists = db.scalars(select(GrammarEntry).where(GrammarEntry.pattern == row["pattern"])).first()
        if exists:
            print(f"skip grammar: {row['pattern']} (already exists)")
            continue
        db.add(GrammarEntry(**row, jlpt_level="N5", status=ContentStatus.APPROVED, source=ContentSource.MANUAL))
        print(f"add grammar: {row['pattern']}")


def main() -> None:
    db = SessionLocal()
    try:
        seed_kanji(db)
        seed_vocab(db)
        seed_grammar(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()