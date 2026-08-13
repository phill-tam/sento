"""Turns line_id/item_id refs into real content text.

Extracted from routes/sentences.py once epic 012's answer grading became a
second caller. Both features take the same `SourceItemRef` shape from the
frontend and both must hand an AI provider actual Japanese rather than
opaque UUIDs, so the mapping from a line id to its table and its display
formatting belongs in one place.

Raises HTTPException directly, which is this codebase's existing standard
for single-entity lookups (see the "404/409/501 handled at the service
layer" note in sentence_generation_service) rather than a new convention
introduced here.
"""

from collections.abc import Callable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.grammar_entry import GrammarEntry
from app.models.kanji_entry import KanjiEntry
from app.models.vocab_entry import VocabEntry
from app.schemas.sentence_entry import SourceItemRef

# Maps a source_item_ref's line_id to its content model and a formatter
# that turns one row into a short prompt-ready text snippet. Assumes
# line_id values "kanji" | "vocab" | "grammar", matching the three
# existing route prefixes — flag if the frontend's contentLines.js uses
# different identifiers, this mapping will need to change to match.
LINE_RESOLVERS: dict[str, tuple[type, Callable]] = {
    "kanji": (KanjiEntry, lambda e: f"{e.character} ({e.meaning_en})"),
    "vocab": (VocabEntry, lambda e: f"{e.word} ({e.meaning_en})"),
    "grammar": (GrammarEntry, lambda e: f"{e.pattern} ({e.meaning_en})"),
}


def resolve_source_items(db: Session, refs: list[SourceItemRef]) -> list[str]:
    """Resolves line_id/item_id pairs to real content text for the AI
    prompt — the generation service must never receive opaque IDs.
    404s on any unknown line_id or missing row, same as every other
    single-entity lookup in this codebase.
    """
    snippets: list[str] = []
    for ref in refs:
        resolver = LINE_RESOLVERS.get(ref.line_id)
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
