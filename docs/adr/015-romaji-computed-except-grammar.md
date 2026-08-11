# 015 — Romaji computed at read time, except grammar's two sentence-shaped fields

**Status:** Accepted
**Related:** [006 — Kanji/Vocab/Grammar as dedicated tables](006-kanji-vocab-grammar-dedicated-tables.md), [009 — CSV upload partial-success commit strategy](009-csv-upload-partial-success-commit-strategy.md)

## Context

Epic 009 (#110) adds romaji to every learning item, rendered on cards and
matched by the sidebar search so a learner without a Japanese IME can
find 猫 by typing `neko`.

Romaji is unlike every other field in the three content tables: the
others carry information, this one is a *transformation* of a reading
that already exists elsewhere on the same row. That made the opening
question whether it needs a column at all, or whether it can be computed
from existing data every time a row is read.

Two implementations were tried in sequence and both failed for a
different subset of the content, which is why the final shape is a
hybrid rather than either extreme.

**Attempt 1 — store a column for everything, generated at author time.**
Rejected because it is a cache of `reading`, `onyomi`, `kunyomi` and
`compound_reading` — fields that are user-editable through CSV upload.
The first person to correct a reading without retyping its romaji leaves
the two disagreeing, silently and permanently, for kanji and vocab where
nothing about the relationship needed a human decision in the first
place.

**Attempt 2 — compute everything at read time, no columns anywhere.**
Correct for kanji and vocab, and initially assumed to extend to
grammar's `example_reading` on the reasoning that it was "just kana, like
a vocab reading." That reasoning does not survive contact with the data:
`example_reading` holds a full **sentence**, not a single word, and
sentences need spaces between words that a character-by-character pass
cannot supply. Run through the same transliterator that handles kanji
and vocab correctly, `わたしはがくせいです` comes back as
`watashihagakuseidesu` — mechanically accurate, unreadable, and wrong
for 25 of the 26 seeded examples on spacing alone, independent of any
particle issue.

`pattern` fails the same computed approach for an overlapping but
distinct reason: 28 of its 96 values contain kanji with no reading field
to fall back on at all, and even the kanji-free 68 need the same missing
word-spacing plus a topic-particle correction (は → `wa`, not `ha`) that
only holds because of the particle's grammatical role, not its literal
kana value.

The common thread, once both fields failed for related-but-different
reasons, is **whether the source is one word or many.** A single kanji
reading or vocab word has no internal word boundary to get wrong — kana
concatenates in one unambiguous order. A pattern or a sentence does, and
recovering it needs segmentation, which is a different problem from
transliteration and this codebase has no tool for.

## Decision

**Split by that line.** Fields that are a single Japanese word are
computed at read time and stored nowhere. Fields that are multi-word
Japanese text are hand-authored and stored as a real column, same as any
other content field.

**Computed** (`services/romaji.to_romaji`, called from a Pydantic
`@computed_field` in the `*EntryRead` schema, nothing added to the
model):
- `KanjiEntry.onyomi` / `.kunyomi` / `.compound_reading` →
  `onyomi_romaji` / `kunyomi_romaji` / `compound_romaji`
- `VocabEntry.reading`, falling back to `.word` for the 51 kana-only
  entries with no separate reading → `romaji`

**Stored** (`Mapped[str | None]` columns on `GrammarEntry`, hand-typed,
migration `b3f1c27a9e40`):
- `pattern_romaji` — no reading field exists for `pattern` to derive
  from in the first place
- `example_romaji` — `example_reading` exists and is plain kana, but is
  a sentence, not a word

A small fixed-expression table inside `to_romaji` itself catches the two
vocab entries where the general algorithm is provably wrong despite
being single words: `こんにちは` and `こんばんは`, whose final は is a
fossilised topic particle, not the syllable it would be anywhere else in
the word. This is an exact-string check ahead of the general algorithm,
not a general particle-awareness feature — it does not help with
sentences, where は's role depends on where it falls, not just on the
string containing it.

## Alternatives Considered

- **Store everything, generated at author time.** The first attempt —
  see Context. Correct only for the two-thirds of the content that is
  single words, and a needless cache for exactly that two-thirds.
- **Compute everything, including grammar's `example_reading`.** The
  second attempt — see Context. Fails on missing word spacing for 25 of
  26 seeded examples, independent of any particle handling.
- **A morphological segmenter (e.g. MeCab) so `pattern` and
  `example_reading` could be computed too.** Would remove the authoring
  burden, but is a real dependency with a system-level install
  (dictionary data, non-pure-Python), for two content lines that
  currently hold under 200 hand-typed values combined. Revisit if the
  grammar line grows enough that hand-authoring becomes the bottleneck,
  not before.
- **Store computed values as a cache with a background job to keep them
  in sync with edits.** Solves the drift problem attempt 1 hit, but adds
  a job and a staleness window to solve a problem that not computing at
  all avoids for free, for fields where computing is correct.

## Consequences

- **A new kanji or vocab entry gets romaji on its very next `GET` with
  zero code change and zero migration**, uploaded through the existing
  CSV path exactly as it works today — this was the original motivation
  for reopening the stored-column decision, and it holds for two of the
  three lines.
- **Grammar romaji is hand-maintained forever**, for both fields, with
  no validation that would catch a wrong value. This is a permanent,
  accepted cost of the line's shape — patterns and their examples are
  multi-word Japanese text, not single lookups — not a gap to close
  later.
- **The CSV row parsers for kanji and vocab need no romaji-related
  change at all.** The grammar parser has no way to fill
  `pattern_romaji` / `example_romaji` automatically and will leave them
  `NULL` on upload until a CSV column and/or CMS field is added for
  them — tracked as epic 009 Phase 1, not resolved here.
- **Generated sentences (`generated_sentences.reading`) are sentences,
  not single words**, so the same segmentation failure applies to them
  in principle. Epic 009 Phase 2 already concluded romaji for those
  should come from the generation provider directly rather than be
  derived — this ADR is the reason that conclusion is correct, not a
  separate argument.
- **The romaji values are ASCII**, computed or stored, so the search
  index can match them without normalization.
- **Nothing renders romaji from this decision alone.** The schemas
  expose it; no frontend component reads it yet (epic 009 Phase 3).
