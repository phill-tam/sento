# Epic 003 — Flashcards: Flip-Card Grid & Cross-Line Search

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#43](https://github.com/phill-tam/sento/issues/43)

---

## 1. Problem Statement

Kanji and Vocabulary entries are short, symmetric pairs (a prompt, a
reading, a meaning) that suit a flip card well. Grammar entries carry a
pattern plus a full example sentence — too much for a fixed-height card
without special handling. This epic delivers one uniform flip-card grid
for all three content lines, with the card's back face scrolling
internally when content exceeds its fixed height, rather than giving
Grammar a separate display mode.

It also wires up the sidebar search input — built in epic 001, inert
since — into a working cross-line search over the same in-memory
dataset the sidebar tree already loads.

This is display only. No quiz logic (epic 004) and no content
authoring (epic 002, already shipped) live here; this epic is a pure
consumer of epic 002's existing `GET` endpoints.

---

## 2. Architecture Overview

**One flip-card component for all three lines, not three.**
`FlashcardCard` (`components/study/FlashcardCard.jsx`) takes a single
normalized `item` shape (`{id, lineId, prompt, reading, answer,
example}`) and branches internally only where the lines actually
differ: Kanji gets a dedicated big-character front face with a
separate 音/訓 (onyomi/kunyomi) split, everything else renders a
shared prompt/reading front. The back face renders `item.example` when
present (Kanji's compound word, at the time this epic shipped — Vocab
and Grammar had none) and falls back to the reading otherwise. The back
face has a fixed max-height with internal scroll — the mechanism that
resolves the Grammar-example problem in the Problem Statement without a
second card component.

**A local adapter, not a shared utility, turns raw API entries into
that item shape.** `toFlashcardItems(lineId, entries)` lives directly
in `App.jsx` (not `utils/`) and is line-specific: Kanji maps
`character`/`onyomi`/`kunyomi`/`compound_word` fields, Vocab maps
`word`/`reading`, Grammar maps `pattern`/`example_jp`/`example_reading`/
`example_en`. `App.jsx`'s own comment marks it explicitly as
unchanged since this epic and reused as-is by epic 005 (display) and
epic 006 (an input into the global quiz pool, called once per line over
every entry rather than just the active category's).

**The sidebar tree gets a second-level adapter.** Epic 002's
`contentTreeAdapter.js` stops at category level, since the CMS switches
lines via a dropdown. This epic's `utils/studyTreeAdapter.js`
(`toStudyTreeShape`) goes one level deeper — lines as top-level nodes,
each line's real categories as children — reusing `CategoryTree`'s
generic `{id, label, labelJp, icon, count, total, complete}` contract
(epic 001, ADR 003) unchanged. `count`/`complete` here are **study
progress** (entries the learner has marked mastered, via `useMastered`)
— a different meaning than epic 002's `contentTreeAdapter.js`, where
`complete` means "every entry in this category has `status=approved`."
Both adapters satisfy the same `CategoryTree` contract with unrelated
underlying data.

**Mastery is per-line `localStorage`, not a backend field.**
`hooks/useMastered.js` keeps one `Set` of entry ids per content line,
namespaced `sento:mastered:{kanji,vocab,grammar}`, with a `toggle`
function. `studyTreeAdapter.js` reads these sets directly to compute
each category's `count`/`complete`.

**Search is a flat index over all three lines, matched by substring.**
`utils/searchIndex.js` exports `buildSearchIndex(dataByLine)` (built
once per data load) and `searchIndex(index, query)` (filtered per
keystroke). Each line's differently-shaped entries are normalized into
one `{id, lineId, categoryId, prompt, reading, answer}` record —
`PROMPT_FIELD_BY_LINE` maps `character`/`word`/`pattern`,
`readingFor()` branches per line (Kanji joins onyomi+kunyomi, Vocab
uses `reading`, Grammar uses `example_reading`), and `meaning_en` is
always `answer` since it's the one field shared by all three schemas.
An empty or whitespace-only query returns `[]`, not the full index —
`SearchResults` only renders once there's an actual query.

**`StudyPage` composes the read-only view; it does not own state.**
`pages/StudyPage.jsx` renders the header (category icon/label, line
pill, item count), `ModeToggle`, a mastered-progress bar, and
`FlashcardGrid` from props. It holds no `useState` of its own related
to which line/category is active or what the search query is.

---

## 3. Data Model

None — consumes epic 002's existing `GET /api/v1/{kanji,vocab,grammar}`
endpoints only.

---

## 4. API Surface

None.

---

## 5. Frontend Components

| Component | Purpose |
|---|---|
| `constants/contentLines.js` | Shared `{id, label, labelJp, icon, unitLabel}` per content line — single source for the tree adapter and `StudyPage`'s header |
| `constants/categoryIcons.js` | Per-line category-id → icon lookup (`CATEGORY_ICONS`), falling back to the line's own icon for any category not listed |
| `utils/studyTreeAdapter.js` | `toStudyTreeShape` — maps all three lines' `GET` responses into `CategoryTree`'s two-level (line → category) shape; `count`/`complete` derived from `useMastered`, not entry `status` |
| `utils/searchIndex.js` | `buildSearchIndex` / `searchIndex` — flat normalized `{prompt, reading, answer, lineId, categoryId}` index across all three lines, with substring query filtering |
| `hooks/useMastered.js` | `localStorage`-backed mastered-id `Set` per content line, namespaced `sento:mastered:{lineId}` |
| `components/study/FlashcardCard.jsx` | The flip card: front (category tag, prompt, reading, mastered check), back (answer, example block or fallback reading, internally scrollable at a fixed max-height), mastered toggle |
| `components/study/FlashcardGrid.jsx` | Grid wrapper mapping an item array to `FlashcardCard`, shared across all three lines |
| `components/study/SearchResults.jsx` | Flat filtered result rows from `searchIndex()`; clicking a row selects that result's line and category |
| `pages/StudyPage.jsx` | Header (category icon/name + line pill + item count), `ModeToggle`, progress bar, `FlashcardGrid` — presentational, driven entirely by props |
| `App.jsx` (`toFlashcardItems`) | Per-line adapter from raw API entries to `FlashcardCard`'s normalized item shape — lives in `App.jsx` itself, not `utils/` |

---

## 6. Decisions

No new ADRs were recorded for this epic. It reuses epic 001's
`CategoryTree` generic prop contract (ADR 003) one level deeper — lines
as top-level nodes, categories as children — rather than introducing a
second tree component or loosening the contract.

This epic shipped behind `VITE_FEATURE_STUDY_FLASHCARDS`, gating both
the three-line data fetch and the `study` view in `App.jsx`, following
epic 001's per-epic flag naming convention (ADR 005). The flag was
later removed along with every other per-epic flag once all fifteen
epics had shipped (ADR 012); `grep -r VITE_FEATURE_STUDY_FLASHCARDS
frontend/` returns nothing in the current codebase. Study, along with
every other epic's feature, is unconditionally on today.

---

## 7. Notable Implementation Details — Where the As-Built Code Diverges From the Plan

- **`StudyPage` is presentational, not stateful.** An earlier plan had
  it fetching all three lines on mount and owning active-line/category/
  search state itself. It doesn't: `App.jsx` does all of that — the
  `Promise.all` fetch into `dataByLine`, `openLineIds`, `activeLineId`,
  `activeCategoryId`, `searchQuery`, the tree memo
  (`toStudyTreeShape`) and the search memo (`searchIndex`).
  `StudyPage` receives roughly twenty props and renders. That lift
  happened so Quiz Mode (epic 004) and the Sentence Generator (epic 005)
  could share the same selection state across pages without `StudyPage`
  itself needing to know about either.
- **Search lives in the sidebar, not the page.** The `<input>` is
  rendered directly in `App.jsx`'s sidebar slot and goes `readOnly`
  whenever the active view isn't `study`; `SearchResults` replaces
  `CategoryTree` in that same slot while the query is non-empty.
- **Category-icon reconciliation is done.** Coverage today is Kanji 9,
  Vocab 13, Grammar 17 categories against the real seed data, each with
  a per-line icon fallback (`getCategoryIcon` in `categoryIcons.js`) —
  the open question the original planning left unresolved is closed.
- **The card gained a sound effect and a selection mode after this
  epic, not during it.** `FlashcardCard`'s `handleFlip` calls
  `playCardOpenSound`/`playCardCloseSound` (epic 007), and the ✓ button
  doubles as the quiz/generator select control when `selectionMode` is
  true (epic 004, later epic 005) — both are additive props on the same
  component this epic shipped, not a rewrite.

---

## 8. Planned Upgrades / Later Epics That Build On This

- **Epic 004 (Quiz Mode)** repurposed the ✓ button: `FlashcardCard`'s
  `selectionMode` prop makes it mean "select for quiz" instead of
  "toggle mastered," with `isSelected`/`onToggleSelect` driving it
  instead of `isMastered`/`onToggleMastered`. The mastered badge keeps
  rendering off `isMastered` regardless of mode — the two are
  structurally independent, not swapped out.
- **Epic 006 (global cross-type quiz)** reused this epic's
  `toFlashcardItems` adapter unchanged as an input to `App.jsx`'s
  `globalQuizPool`, called once per line over every entry rather than
  just the active category's items.
- **Epic 010 (Long-Content Layout)** gave Grammar (and long Vocab
  categories like `greetings`) a full-width list layout that flips
  vertically instead of the fixed-height grid tile this epic shipped
  with — see `utils/categoryLayout.js` and ADR 016. `FlashcardCard`'s
  `layout` prop (`"grid" | "list"`) and `FlashcardGrid`'s matching prop
  were both added then; this epic's card is layout `"grid"` throughout.
- **Epic 007 (Sound)** added the flip sound effect described in
  Section 7.
- **Epic 009 (Romaji)** added the `showRomaji`-gated romaji lines on
  both faces, matched field-for-field against `readingFor`/`romajiFor`
  in `searchIndex.js` so a romaji query hits exactly what the
  equivalent kana query would.

---

## 9. Open Questions

- **"Mastered" still affects nothing outside this epic.** It is a
  purely visual checkmark plus the sidebar tree's progress counts. It
  does not filter the quiz pool — epic 006's `globalQuizPool` in
  `App.jsx` ignores mastered state entirely.
- **Scroll UX on the card back was never validated against the longest
  seeded Grammar example.** The fixed height plus internal scroll is in
  place; whether it feels cramped in practice with real seed data is
  untested.
