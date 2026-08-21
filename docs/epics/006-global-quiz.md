# Epic 006 — Global Quiz: Cross-Line, Mixed-Type Selection

**Status:** Complete (selection state later unified further by epic 012 — see §7)
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#77](https://github.com/phill-tam/sento/issues/77)

---

## 1. Problem Statement

Quiz Mode (#52) could only quiz one category at a time: `selectedIds`
held bare item ids, distractors were drawn from the open category, and
the whole quiz lived inside `StudyPage`. That ruled out the two most
useful drills — mixing kanji, vocabulary and grammar in one sitting,
and quizzing the sentences the generator (#61) had just produced.

This epic makes the quiz pool **global and mixed-type**: every entry
across all three content lines plus every saved generated sentence,
selectable from either the Study page or the Generate page, feeding
one run. Referred to as **"epic 6"** throughout in-code comments
(`App.jsx`, `useQuiz.js`, `StudyPage.jsx`, `GeneratePage.jsx`).

Issue #77's body was reconstructed after the fact from shipped code and
commit history — there was no epic write-up and no new ADR at the time.
This document is the write-up that fills that gap.

---

## 2. Architecture Overview

**One shared item shape feeds the whole quiz.** `toFlashcardItems`
(`frontend/src/App.jsx`) maps each line's raw API entries into
`{id, lineId, prompt, reading, answer, example, ...}`; `toSentenceQuizItems`
maps saved `GeneratedSentence` rows into the same shape with
`lineId: "sentence"` and an extra `source_item_refs` field carried
through untouched. `globalQuizPool` (`App.jsx`) concatenates
`toFlashcardItems` over all three lines with `toSentenceQuizItems` over
`allGeneratorSentences`, memoized on `[dataByLine, allGeneratorSentences]`.
`useQuiz`'s `buildOptions`/`poolFor` (`frontend/src/hooks/useQuiz.js`)
branch on that one `lineId` field and need to know nothing else about
where an item came from.

**Composite selection keys replace bare ids.** A bare item id can't
disambiguate kanji vs. vocab vs. grammar vs. a saved sentence once
selection spans four sources sharing one quiz run. `App.jsx` introduced
`makeSelectionKey(itemType, itemId)` → `"${itemType}:${itemId}"` and
`splitSelectionKey` for the reverse. Both still exist verbatim in
current code (`App.jsx:296`, `App.jsx:303`), unrenamed by any later
epic.

**Composite keys are translated back to bare ids at the page
boundary**, so the generic display components never learn the composite
scheme exists. `StudyPage.jsx`'s `quizSelectedIdsForLine` (a `useMemo`
filtering the global key set down to the active line's prefix, then
stripping it) hands `FlashcardGrid` a plain `Set` of bare ids exactly as
it always has. `GeneratePage.jsx`'s `quizSelectedSentenceIds` does the
identical filter/strip against the `"sentence:"` prefix for `SentenceList`.
Both names and both call sites are unchanged from this epic.

**`QuizRunner` was promoted out of `StudyPage` into `App.jsx`.** Because
a quiz can now be built from items selected across two different pages
(Study and Generate), the active run can no longer live inside either
page component — it has to intercept above the view switch. `App.jsx`
renders `QuizRunner`/`PairWritingRunner` (the latter added later by
epic 012) whenever `quizPhase === "active"`, before checking `view` at
all; `StudyPage` lost the runner code this displaced.

**Navigation guarding was relaxed, not removed.** Before this epic,
entering selection mode on the one page that had a quiz was enough of a
localized action that guarding it defensively was unnecessary friction.
Once selection could span two pages built up over multiple visits, a
learner needs to move freely between Study and Generate — and even
switch categories or lines — while still building one selection.
`guardNavigation` (`App.jsx:271`) now intercepts line toggles, category
selects, view switches and mode changes only while `quizInProgress`
(`quizPhase === "active"`) or a generator run is
configuring/generating/reviewing — not while merely "selecting".

---

## 3. Data Model

None. This epic is pure frontend state and derived-data reshaping; no
backend models, tables, or migrations were touched.

---

## 4. API Surface

None. No new endpoints. `allGeneratorSentences` (§5) is a new *client-side*
fetch against the existing sentence-listing endpoint, unscoped by folder
rather than a new route.

---

## 5. Frontend Components

This epic mostly modified existing components rather than adding new
ones — there is no new component tree, just an extension of the
selection/quiz-pool model into components that already existed.

| File | Change |
|---|---|
| `frontend/src/App.jsx` | Added `makeSelectionKey`/`splitSelectionKey`, `globalQuizPool`, `canQuizGlobally`, `toSentenceQuizItems`, `allGeneratorSentences` state, promoted `QuizRunner` above the view switch, relaxed `guardNavigation` to active-only |
| `frontend/src/hooks/useQuiz.js` | `categoryPool` renamed to `globalPool`; added `poolFor()` for per-type distractor resolution |
| `frontend/src/pages/StudyPage.jsx` | Added `quizSelectedIdsForLine` (composite-key → bare-id translation for the active line), lost its embedded `QuizRunner` |
| `frontend/src/pages/GeneratePage.jsx` | Rendered `ModeToggle` for the first time; added `quizSelectedSentenceIds` so saved sentences became quiz-selectable |
| `frontend/src/components/generator/SentenceListItem.jsx` | Added selection-mode support (checkbox affordance driven by the page's selection state) |
| `frontend/src/components/generator/SentenceList.jsx` | Added selection-mode support, threading `selectedIds`/`onToggleSelect`/`selectionCap` to each item |
| `frontend/src/components/quiz/QuizRunner.jsx` | Promoted out of `StudyPage`; now takes `selectedItems`/`globalPool` as props from `App.jsx` rather than reading page-local state |

---

## 6. Decisions

**Distractor resolution differs per item type (`poolFor`,
`useQuiz.js`).** For a sentence, wrong answers are drawn from the
sentence's own `source_item_refs`, resolved against the global pool —
a sentence's distractors should be things it was actually generated
from, not arbitrary other sentences, falling back to other sentences
if that list is short. For everything else, wrong answers come from
any item sharing the same `lineId` anywhere in the pool (no longer
scoped to one category), with the entire pool concatenated on as a
fallback. `buildOptions` then dedupes by answer text and pads from the
raw pool if dedup left fewer than three distractors, so a question is
never rendered with fewer options than the pool can supply.

**Two sentence lists were kept deliberately separate.**
`generatorSentences` is folder-scoped and refetches on folder switch —
the existing browsing list. `allGeneratorSentences` is unscoped and
refetches only on save or delete. A folder switch or a relocate doesn't
change *which* sentences exist, so it must not invalidate the quiz
pool by refetching it on every folder click.

**Quiz eligibility became a single global gate.**
`canQuizGlobally = globalQuizPool.length >= MIN_QUIZ_ITEMS` replaces
the old per-category check. `MIN_QUIZ_ITEMS` still exists locally in
both `StudyPage.jsx` and `GeneratePage.jsx`, but only as a display-only
fallback feeding `QuizEmptyState`'s copy — the actual gate is the
`canQuiz`/`quizPoolSize` props both pages receive from `App.jsx`.

**Navigation guarding was relaxed, not removed** (see §2) — building a
cross-page, cross-type selection has to be free, or the feature is
unusable, but an *active* run (quiz, pair run, or in-progress
generator workflow) still blocks navigation to avoid losing it.

---

## 7. Later Changes

**Epic 012 unified selection state further.** As shipped, this epic's
selection model was `quizPhase`/`selectedIds` — a phase string plus one
composite-keyed `Set`, alongside a parallel, independently-managed pair
for the generator's own picker (`generatorSelectionPhase`/
`generatorSelectedIds`). The two pickers had to be hand-synchronized at
every entry point to guarantee exclusivity.

Epic 012 (Word Pairs, the second quiz type) replaced that with one
`selection = { kind: null | "quiz" | "generator" | "pairs", ids: Set }`
object in `App.jsx`, from which `quizPhase`, `selectedIds`,
`generatorSelectionPhase` and `generatorSelectedIds` are now all
*derived* per render rather than held as separate state — see
`docs/epics/012-pair-writing-quiz.md` for the full shape and rationale.
This epic's own contribution — the composite key format
(`makeSelectionKey`/`splitSelectionKey`), the global pool, `poolFor`'s
per-type distractor resolution, and the two-sentence-list split —
was untouched by that unification and remains exactly as described
above; only the container holding the selected keys changed shape.

**Feature flags gating this epic no longer exist.** At the time #77 was
open, `VITE_FEATURE_QUIZ_MODE` and `VITE_FEATURE_SENTENCE_GENERATOR`
still gated Quiz Mode and the Generator respectively — with the
generator flag off, `globalQuizPool` simply contained no sentence
items and everything else still worked. Both flags, and every other
per-epic `FEATURE_*` flag, were later removed once all epics shipped
(ADR 012, `docs/adr/012-feature-flags-removed-admin-write-gate.md`).
`frontend/src/config/featureFlags.js` no longer exists; a repo-wide
grep for `VITE_FEATURE_` and `FEATURE_` under `frontend/` turns up
nothing. Study, Quiz, the Generator and the global quiz pool are
unconditionally on today.

---

## 8. Open Questions

Carried over from issue #77's "Known open items, not blocking" list,
still open in current code:

- **The generator's own source-item picker stayed per-line.** Only the
  quiz selection went global in this epic; `handleContinueGenerator`
  still stamps every source-item ref with a single `activeLineId`
  rather than a per-item line, unlike the quiz's composite keys.
- **`useQuiz` freezes `questions` at mount** with an empty dependency
  array, relying on the (now-relaxed) navigation guard to keep
  `selectedItems`/`globalPool` stable for the duration of an active
  run. Correct today, but it's an invariant enforced by `App.jsx`'s
  guard rather than by the hook itself.
- **`poolFor`'s non-sentence branch concatenates `sameLine` with the
  entire pool** rather than excluding cross-line items outright, so
  cross-line distractors remain reachable as a fallback. Intentional,
  but it means a kanji question can surface a grammar meaning as a
  wrong answer when its own line is thin.
- **Selection cap is a flat 20 across all types**, with no per-type
  balance — a run can legally be 20 sentences and nothing else.
