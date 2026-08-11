# Epic 009 — Romaji: Computed Transliteration, Authored Sentences, Romaji Search

**Status:** Complete
**Repo:** sento
**Scope:** Backend (FastAPI) + Frontend (React/Vite)
**Issue:** [#110](https://github.com/phill-tam/sento/issues/110)

---

## 1. Problem Statement

Every study item displayed Japanese text and, where available, a kana
reading. Nothing displayed romaji.

Two costs followed. A learner still working through kana had no way into
a card whose prompt, reading and example were all Japanese script. And
more concretely: **the sidebar search matched kana and English only**, so
anyone without a Japanese IME could not search the app in Japanese at
all. Typing `neko` found nothing.

This epic adds romaji to every content line, to generated sentences, and
to the search index, behind a visibility preference that defaults on.

The card-layout problems this exposed — long grammar patterns whose
romaji does not fit a 180px tile — are deliberately **not** solved here.
They became epic 010 ([#116](https://github.com/phill-tam/sento/issues/116)).

---

## 2. Architecture Overview

**Romaji is computed for two content lines and stored for the other two
kinds of text. The dividing line is single-word vs. multi-word, not
content type.** This is the central decision of the epic and it took two
reversals to reach — see Section 6 and ADR 015.

A single Japanese *word* has no internal word boundary to get wrong: its
kana concatenate in one unambiguous order, so romaji is a pure function
of the reading and storing it would only be a cache of data already on
the row. Multi-word text is different — putting spaces between words is
**segmentation**, which a character-level pass cannot do.

| text | romaji source |
|---|---|
| `KanjiEntry.onyomi` / `.kunyomi` / `.compound_reading` | computed at read time |
| `VocabEntry.reading`, falling back to `.word` | computed at read time |
| `GrammarEntry.pattern` | stored column, hand-authored |
| `GrammarEntry.example_reading` | stored column, hand-authored |
| `GeneratedSentence.reading` | stored column, provider-supplied |

**Computed values never touch the database.** `services/romaji.py` is a
pure kana→romaji function with no ORM or framework imports, called from
Pydantic `@computed_field` properties on `KanjiEntryRead` and
`VocabEntryRead`. `kanji_entries` and `vocab_entries` gained **no
columns**, so a newly uploaded entry returns correct romaji on its next
`GET` with no migration, no backfill and no authoring.

**Grammar is authored because it cannot be derived.** Measured against
the seed set, **74 of 96 patterns** disagree with a mechanical
transliteration. 28 contain bare kanji with no reading field behind them
(`~の上/下/中/前/後ろ/隣/近くに`). Topic-particle は romanises as `wa`
rather than `ha` only because of its grammatical role. And patterns need
word spacing: `~はどこにありますか` mechanically yields
`~hadokoniarimasuka`, which is accurate and unreadable.

**`example_reading` is authored for the same reason, despite being plain
kana.** This was the second reversal: it looks like a vocab reading, but
it holds a full sentence. Mechanical output disagreed with the correct
romaji for **25 of 26** seeded examples on word spacing alone,
independent of any particle handling.

**Generated sentences get romaji from the AI provider, not from
transliterating their reading** — the same segmentation problem, and the
one place in this codebase where asking the model is the correct
engineering answer rather than the lazy one. The prompt pins the format
so provider output cannot drift from computed output.

**Output is kana-faithful, not macron Hepburn.** おう→`ou`, never `ō`.
This is a correctness constraint: separating 王 (`ō`, a long vowel) from
追う (`ou`, a verb ending) requires the morpheme boundary, which no
character-level pass recovers, so macrons would silently mis-romanise
every う-verb in the vocab line (思う as `omō`). It also happens to be
what a learner types into a search box.

**Search ignores the visibility preference, deliberately.** The
preference governs whether romaji is *shown on cards*. Suppressing a
match for text the user explicitly typed would be a bug, not a setting —
so `neko` finds 猫 with romaji hidden. `romajiFor` mirrors
`searchIndex.js`'s existing `readingFor` field-for-field, so a romaji
query matches exactly what the equivalent kana query would.

**Nothing transliterates on the frontend.** Every romaji value arrives
from the API already rendered. This is what kept the frontend's runtime
dependencies at `react` + `react-dom` — the alternative (deriving in the
browser) would have required either a kana library, the project's first
runtime dependency, or a second hand-written kana table to drift from
the backend's.

---

## 3. Data Model

**No change** to `kanji_entries` or `vocab_entries`.

**`GrammarEntry`** — adds `pattern_romaji`, `example_romaji`, both
nullable `Text`. Migration `b3f1c27a9e40`.

**`GeneratedSentence`** — adds `romaji`, nullable `Text`. Migration
`c8a4e91d7b52`. Nullable unlike its sibling `reading` for two reasons:
rows saved before this epic have none and can never be backfilled, and a
provider that omits the field should degrade to a sentence without
romaji rather than fail an entire generation round.

Seed data: all 96 grammar `pattern_romaji` values hand-written, plus 26
`example_romaji`. This epic also backfilled `example_reading` itself,
closing the gap epic 002 §8 recorded as "NULL across the board" — it was
worse than documented, the key being absent from all 96 seed dicts.

---

## 4. API Surface

No new endpoints. Existing read schemas gain fields:

| schema | added | how |
|---|---|---|
| `KanjiEntryRead` | `onyomi_romaji`, `kunyomi_romaji`, `compound_romaji` | computed |
| `VocabEntryRead` | `romaji` | computed |
| `GrammarEntryRead` | `pattern_romaji`, `example_romaji` | stored |
| `GeneratedSentenceRead` | `romaji` | stored |
| `GeneratedSentenceCandidate`, `SentenceSaveItem` | `romaji` (optional) | provider |

Grammar CSV upload accepts optional `pattern_romaji` and `example_romaji`
columns. Kanji and vocab uploads are unchanged and need no romaji column.

All additions are additive — extra JSON keys that older clients ignore.

---

## 5. Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `context/RomajiContext.jsx` | `context/` | `sento:romaji` preference, defaults on; mounted in `main.jsx` |

**Modified:**

| Component | Change |
|---|---|
| `App.jsx` | `toFlashcardItems` threads romaji for all three lines; `toSentenceQuizItems` takes the provider value |
| `study/FlashcardCard.jsx` | Romaji on front, meaning side and example box |
| `quiz/QuizCard.jsx` | Romaji under the prompt |
| `study/SearchResults.jsx` | Shows romaji only on rows the query actually matched on |
| `generator/SentenceListItem.jsx`, `SentenceReviewPanel.jsx` | Romaji on generated sentences |
| `utils/searchIndex.js` | `romajiFor` + romaji in the substring filter |
| `common/SettingsPanel.jsx` | Romaji row, following the Theme row's pattern |
| `hooks/useSentenceGenerator.js` | Carries romaji from candidate into the save payload |

Kanji carries romaji twice on purpose: a joined `romaji` mirrors the
joined `reading` for the quiz prompt and search, while
`onyomiRomaji`/`kunyomiRomaji` stay separate because the card labels each
reading 音/訓 and a joined string cannot be paired back to its own label.

---

## 6. Decisions

**ADR 015 — romaji computed except grammar's sentence-shaped fields.**
The only ADR from this epic, and it records two reversals rather than one
decision, because both rejected positions are ones a reader would
otherwise arrive at independently:

- **Round 1, store everything.** Rejected: readings are user-editable
  through CSV upload, so stored romaji is a cache that drifts the first
  time someone corrects a reading without retyping the romaji.
- **Round 2, compute everything.** Correct for kanji and vocab, and
  assumed to extend to grammar's `example_reading` because it is plain
  kana. It does not — see Section 2.

---

## 7. Notable Implementation Details

**A `text-transform: lowercase` bug the browser caught and review would
not have.** Added defensively to the romaji CSS, it silently destroyed
grammar's Latin placeholders: `A wa B yori 〜` rendered as
`a wa b yori 〜`, no longer corresponding to the `AはBより〜` shown
directly above it.

**`readStoredVisible` must fall through to `DEFAULT_VISIBLE` on an absent
key.** It originally compared `getItem(...) === 'true'`, which returns
`false` for a key that was never set — so flipping the default would have
changed nothing for exactly the users a default exists for.

**The visibility default was reversed on product grounds.** It shipped
off, on the reasoning that romaji beside kana gets read *instead* of the
kana and trains beginners out of decoding the script. That argument still
holds on its own terms; it was overruled because a first-time visitor who
cannot read kana meets a wall of characters with no way in, and finding
the setting requires already knowing to look for it.

**A pre-existing seed bug surfaced.** `seed_content.py` checks for
existing rows with a DB query, but `SessionLocal` sets `autoflush=False`,
so rows added earlier in the same run are invisible to it.
`grammar_seeds.py` lists `Vたいです` twice, so both databases hold a
duplicate row. Predates this epic, tracked separately. Note this
contradicts epic 002 §8's claim of an in-memory `seen` set — there isn't
one.

---

## 8. Planned Upgrades (future phases)

- **Tests for `to_romaji`.** There are none, and `backend/tests/` is
  still empty so CI's pytest step skips. This function computes romaji
  for 347 entries on every production API response, and its edge cases
  are the fragile kind — gemination, the `n'` boundary, okurigana parens,
  the fixed-expression table, the deliberate no-macron rule. If someone
  "corrects" `ou` to `ō`, nothing catches it.
- **Long-content card layout** — epic 010
  ([#116](https://github.com/phill-tam/sento/issues/116)). Five grammar
  patterns overflow their tile; `white-space: nowrap` on `.romaji` is an
  explicitly-labelled stopgap that epic removes.
- **Surfacing romaji-less grammar uploads.** `pattern_romaji` is
  optional on CSV upload, so an omitting upload silently produces cards
  with no romaji line. `BatchUploadResponse` has no warning channel;
  adding one means changing the shared upload service contract for all
  three lines.
- **Romaji as a quiz answer format** — letting a learner type `neko`.
  Reaches `useQuiz` and distractor generation; roughly doubles the epic.
- **The 70 grammar patterns with no `example_jp` at all**, unchanged
  here but more visible now that the other 26 render fully.

---

## 9. Open Questions

- **Provider format compliance is unverified over time.** The prompt
  pins kana-faithful romaji and particle handling, but nothing validates
  the response. A provider drifting to macrons would put `tōkyō` on a
  sentence card beside `toukyou` on a vocab card. Cosmetic, silent, and
  only caught by looking.
- **Should `QuizCard` follow epic 010's list treatment** for long grammar
  prompts? The same content flows through it, and it was left out of
  #116's scope.
- **Does the romaji toggle belong on `StartGate`** beside the theme
  toggle, or is the gear sufficient? Theme is chosen before the app
  opens; romaji currently is not.
