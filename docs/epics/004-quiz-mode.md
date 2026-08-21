# Epic 004 — Quiz Mode: Selective-Recall Multiple Choice

**Status:** Complete (substantially reworked by epic 006 — see §7)
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#52](https://github.com/phill-tam/sento/issues/52)

---

## 1. Problem Statement

Quiz Mode existed only as a `ModeToggle` button flipping a `mode` state
nobody read — `StudyPage` always rendered `FlashcardGrid` regardless of
which mode was selected. This epic built the real mechanic: the learner
picks up to 20 items from the active category, takes a multiple-choice
quiz over exactly that set, and sees a score immediately afterward. It
was a redesign of a previously planned, unbuilt `004` — the original
draft assumed separate per-line pages that no longer existed once epic
003 shipped one shared `StudyPage`.

Issue #52's body was reconstructed after the fact from shipped code and
commit history — there was no epic write-up and no new ADR at the time.
This document is the write-up that fills that gap.

**Read this alongside `docs/epics/006-global-quiz.md`.** Epic 006
substantially reworked four of the decisions this epic shipped, within
weeks. Section 7 below lists exactly what changed; the rest of this
document describes the mechanic as it was originally built, since that
shape (the state machine, the selection-then-run flow, the confirm-
before-discard guard) is still what's running today, just operating
over a global pool instead of one category.

---

## 2. Architecture Overview

**Selection is a mode of the existing flashcard grid, not a separate
picker UI.** `FlashcardCard`'s ✓ button — previously only a mastery
toggle — gained `selectionMode`/`isSelected`/`onToggleSelect`/
`selectDisabled` props. When `selectionMode` is true the button means
"select this item for the quiz" instead of "toggle mastered"; the two
concerns share one control but are otherwise independent (the mastered
badge keeps rendering off `isMastered` regardless of mode).
`FlashcardGrid.jsx` threads the same props through to every card.

**`useQuiz` is a state machine over a frozen item array.**
`hooks/useQuiz.js` takes the selected `FlashcardItem[]` at construction
and drives `idle → answering → answered → complete`. Each question's
four options are built once (`buildOptions`), with distractors drawn —
at this epic's scope — from other items in the same category and
deduped by answer text; a padding fallback re-admits duplicates rather
than rendering fewer than four options if dedup leaves too few
candidates.

**Selection state (`quizPhase`, `selectedIds`) is lifted to `App.jsx`**
rather than owned by `StudyPage`, matching epic 003's pattern of
pushing shared state up so it can eventually be read by more than one
page. `SELECTION_CAP` (20) enforces the cap centrally rather than in
the grid.

**`ModeToggle`'s "Quiz me" button becomes a live selection counter.**
During the selecting phase its label becomes `Start Quiz (n/20)`, with
a dimmed/pending sub-state below the 4-item minimum and a gold/ready
sub-state once enough items are selected.

**Leaving mid-selection or mid-quiz is guarded.** `ConfirmDialog`
(`components/common/ConfirmDialog.jsx`) is a generic, fully controlled
confirm/cancel modal — `open`/`message`/`onConfirm`/`onCancel` — reused
by later epics for the same purpose. At this epic's scope it fires on
any navigation action (line/category switch, view switch, mode change)
that would discard an in-progress selection or an active quiz.

---

## 3. Data Model

None.

---

## 4. API Surface

None — consumes epic 003's `FlashcardItem` shape directly, one level up.
No new endpoints.

---

## 5. Frontend Components

| Component | Purpose |
|---|---|
| `hooks/useQuiz.js` | State machine (`idle → answering → answered → complete`) over a selected item array; builds shuffled 4-option questions with deduped distractors |
| `components/common/ConfirmDialog.jsx` | Generic confirm/cancel modal, controlled via `open`/`message`/`onConfirm`/`onCancel` — reused by every later epic that needs to guard a discard |
| `components/quiz/QuizCard.jsx` | Current question, 4 shuffled options, per-answer feedback, Next button |
| `components/quiz/QuizSummary.jsx` | Ephemeral score display, Finish button |
| `components/quiz/QuizEmptyState.jsx` | Rendered in place of `ModeToggle` when too few items are available to quiz |
| `components/study/FlashcardCard.jsx` | Gained `selectionMode`/`isSelected`/`onToggleSelect`/`selectDisabled`, repurposing the existing ✓ button |
| `components/layouts/ModeToggle.jsx` | "Quiz me" transforms into `Start Quiz (n/20)` during selection, with pending/ready sub-states |
| `App.jsx` | Owns `quizPhase`/`selectedIds`, enforces `SELECTION_CAP`, wires the `ConfirmDialog` navigation guard |
| `pages/StudyPage.jsx` | Wires all quiz phases together and rendered the active `QuizCard`/`QuizSummary` run at this epic's scope (later moved — see §7) |

---

## 6. Decisions

No new ADRs were recorded for this epic — it reuses epic 003's
`FlashcardItem` shape directly rather than introducing a parallel one.

This epic shipped behind `FEATURE_QUIZ_MODE` / `VITE_FEATURE_QUIZ_MODE`
in `config/featureFlags.js`, read only in `App.jsx`'s `handleModeChange`
— with the flag off, the toggle simply never entered the `selecting`
phase; the quiz UI itself was reached purely through `quizPhase`, with
no second check anywhere downstream. Like every other per-epic flag,
this was removed once all epics had shipped (ADR 012,
`docs/adr/012-feature-flags-removed-admin-write-gate.md`); a grep for
`VITE_FEATURE_QUIZ_MODE`/`FEATURE_QUIZ_MODE` under `frontend/` returns
nothing today, and `config/featureFlags.js` no longer exists at all.

---

## 7. Superseded by Epic 006

Epic 006 (Global Quiz, `docs/epics/006-global-quiz.md`) reworked this
epic's design within weeks of it shipping. Four decisions recorded
above no longer describe the running code:

1. **Selection is no longer scoped to the open category.** `selectedIds`
   now holds composite `"${itemType}:${itemId}"` keys and spans every
   content line plus saved generated sentences, not just the active
   category's items.
2. **Distractors no longer come from the same category.** `useQuiz`'s
   `poolFor` draws from the same *line* anywhere in the global pool
   (falling back to the whole pool), and for sentence items resolves
   the sentence's own `source_item_refs` instead.
3. **The 4-item minimum gates the global pool, not one category.**
   `App.jsx`'s `canQuizGlobally = globalQuizPool.length >= MIN_QUIZ_ITEMS`
   (still `4`, `App.jsx:60`) replaced the old per-category check.
   `MIN_QUIZ_ITEMS` still exists locally in `StudyPage`/`GeneratePage`,
   but only as a display-only fallback for `QuizEmptyState`'s copy —
   the real gate is the `canQuiz` prop passed down from `App.jsx`.
4. **`StudyPage` no longer renders the active quiz.** `QuizRunner` was
   promoted into `App.jsx`, intercepting `quizPhase === "active"` above
   the view switch, so a quiz survives being started from either Study
   or Generate.

Also relaxed: the *selecting* phase no longer blocks navigation — only
an *active* quiz (or an in-progress generator run) triggers
`ConfirmDialog` now, since building a selection across two pages has to
be free or the feature this epic didn't yet have would be unusable.

`SELECTION_CAP` (still 20, `App.jsx:57`) and `ConfirmDialog` itself are
unchanged by any of this — see epic 006's own doc for the full current
shape.

---

## 8. Open Questions

Carried over from issue #52's "Known open items, not blocking":

- **No server-side score persistence.** At this epic's scope the score
  was purely ephemeral, lost on Finish — there was no `User` model or
  auth anywhere in the project (ADR 011,
  `docs/adr/011-no-auth-feature-flag-gated-only.md`). This was later
  addressed, client-side, by epic 014's `scoreStore.js` run history.
- **Mastered and quiz stay structurally independent by design.** No
  auto-suggest "mark as mastered" after a correct answer, and mastered
  items are not excluded from the pool — unchanged since.
- **`useQuiz` exports a `restart` callback that nothing calls.**
  Confirmed still true in current code (`hooks/useQuiz.js:130`,
  `147`) — `QuizSummary` only offers Finish.
- **Distractor dedup is by answer text.** Worth a spot-check against
  categories with several near-duplicate `meaning_en` values; the
  padding fallback re-admits duplicates rather than rendering fewer
  than four options.
