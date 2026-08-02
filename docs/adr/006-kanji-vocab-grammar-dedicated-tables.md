# ADR 006 — Kanji, Vocabulary, and Grammar as Separate Dedicated Tables

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

Epic 002 needed to store three distinct content types — Kanji, Vocabulary,
and Grammar — each with fields the others have no use for: Kanji needs
onyomi/kunyomi readings and compound-word examples; Grammar needs a static
example-sentence triple (Japanese/reading/English); Vocabulary needs
neither. A single shared table covering all three would require every row
to carry several always-`NULL` columns depending on its type.

## Decision

`KanjiEntry`, `VocabEntry`, and `GrammarEntry` are implemented as three
separate SQLAlchemy models with independent tables (`kanji_entries`,
`vocab_entries`, `grammar_entries`), rather than one `ContentEntry` table
with a `content_type` discriminator column and type-specific nullable
fields.

What *is* shared across the three is factored out explicitly rather than
duplicated: `ContentStatus` and `ContentSource` enums live in
`models/content_status.py` and are reused by all three models via the same
underlying Postgres enum types (`content_status`, `content_source`).

## Consequences

**Positive:**
- No row ever carries a column that's structurally meaningless for its
  type — every column on every row is real data.
- Each model's shape is self-documenting; reading `kanji_entry.py` tells
  you everything Kanji needs, with no need to mentally filter out
  Vocab/Grammar-only fields.
- Schema changes to one content type (e.g. adding a new Kanji-specific
  field) never risk touching Vocab or Grammar's table.

**Negative:**
- Three models, three schemas, three route files, three upload-row
  parsers — more files than a single-table design, though most of the
  duplication is structural boilerplate, not logic (the actual
  partial-success insert logic is shared via
  `services/content_upload_service.py`, see ADR 009).
- Any future feature needing to query "all content regardless of type"
  (e.g. a global search) requires a `UNION` across three tables rather
  than one `WHERE content_type IN (...)` query.

## Alternatives Considered

**Single wide table with a `content_type` discriminator.** Rejected —
this is the classic single-table-inheritance schema smell: every row
would carry Kanji-only, Vocab-only, or Grammar-only nullable columns
depending on its type, making the table's actual shape unclear from its
schema alone, and making "which columns matter for this row" a runtime
question instead of a compile-time one.

**Single table with a JSONB `attributes` column for type-specific
fields.** Rejected — loses type safety and column-level validation for
exactly the fields (onyomi, example sentences) most worth validating
explicitly; would also complicate CSV upload row-parsing, which currently
maps 1:1 from CSV columns to typed model fields.