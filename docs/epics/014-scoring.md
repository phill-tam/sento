# Epic 014 — Scoring: Durable Quiz Run History

**Status:** Complete — phases 0–4 shipped and merged.
**Repo:** sento
**Scope:** Frontend (React/Vite) only. No backend, no model, no migration, no deploy.
**Issue:** [#155](https://github.com/phill-tam/sento/issues/155)

---

## 1. Problem Statement

Every quiz result this app produced was thrown away. `useQuiz` counted
correct answers into a `useState`, `QuizSummary` rendered the total once,
and Finish cleared the run — the component said so in its own docblock:
*"Score is never persisted."* A learner who quizzed daily for a month had
no way to see they had improved, because nothing was ever written down.

This epic writes it down, and puts a view over it.

It is the first of three related pieces of work, and deliberately the one
that ships alone:

| epic | what | needs a server? |
|---|---|---|
| **014** (this) | run history in the browser, Progress view | no |
| 015 — Ranking | `sento:deviceId`, `sento:displayName`, `POST /leaderboard` | yes |
| 016 — AI quota | per-device budgets on the two AI endpoints | yes |

Splitting them was the first decision of the epic and is recorded in §6.1.

---

## 2. Architecture Overview

Four pieces, in dependency order:

```
scoreStore.js  ──►  QuizRunner / PairWritingRunner  ──►  ProgressPage
   (phase 1)              (phase 2)                       (phase 3)
```

- **`src/stores/scoreStore.js`** — `recordRun`, `readRuns`, `readStats`,
  `clearRuns` over a single versioned `localStorage` key.
- **The two runners** record on the transition into `complete`.
- **`ProgressPage`** is the fourth top-level view, reading the store at
  mount.

Phase 0 stood up the frontend test harness, which had never run — see
§2.4.

### 2.1 There is no server component, and that is the point

Scoring needs nothing a browser cannot do. Keeping it entirely
client-side means no endpoint, no table, no migration, no rate limiting
and no new trust surface — and it is what let this epic ship on its own
while the leaderboard's much larger question (an unauthenticated write
endpoint that is *intended* to be a shared pile) waits for its own epic.

### 2.2 The record remembers the denominator that was shown

The load-bearing property of the whole epic, and the one a careless
refactor breaks.

`PairQuizSummary` scores a word-pairs run out of `gradedCount`, not out
of the number of pairs. Its docblock is emphatic about why:

> The score reads "n of m" where m is the number of pairs the grader
> actually judged, NOT the number of pairs in the run. A run where the
> provider dropped two pairs must not present as "4 of 6, you got two
> wrong" — those two were never marked.

That rule lived in prose, and prose cannot fail a build. A record storing
`{score, total}` with `total` filled from the pair count would recompute
exactly that lie one screen further along, on a Progress page with
nothing on it to contradict the number.

So `total` is **the denominator that was on screen**, and
`skippedCount`/`ungradedCount` carry the rest of the arithmetic so the
gap stays visible rather than absorbed.

### 2.3 Reads quarantine, writes swallow

The store sits between the two `localStorage` conventions this codebase
already had, and takes one half from each. Full reasoning in
[ADR 020](../adr/020-score-history-storage-conventions.md); the summary
is that they are independent questions:

| question | answered by | this store |
|---|---|---|
| does an unreadable key get moved aside? | does a write rewrite the whole key? | **yes — quarantine** |
| does a failed write shout? | did the user ask for this operation? | **no — swallow** |

Those two axes had previously looked like one, because the only two
examples in the codebase (`useMastered`, `localSentenceStore`) sat at
opposite corners of the grid.

### 2.4 This is also the epic that turned the frontend test suite on

`frontend-ci.yml` had carried a conditional test step since it was
written, and it had never fired: there was no `test` script and no files
for `hashFiles` to match. (The backend half has been live since epic 012
— `backend/tests/` — which CLAUDE.md was still describing as
hypothetical.)

Epic 014 was the right thing to walk through that door: pure client-side
logic, no network, no database, and two bug classes that are genuinely
hard to catch by hand. Phase 0 added Vitest + jsdom + React Testing
Library; every later phase shipped its own tests.

---

## 3. Data Model

No database changes. One `localStorage` key, following the versioned
envelope convention `localSentenceStore` established.

| key | contents |
|---|---|
| `sento:scores` | `{ "v": 1, "items": [ …RunRecord… ] }`, newest first, capped at 200 |
| `sento:scores:quarantine:{ts}` | an unreadable value moved aside, verbatim |

### 3.1 RunRecord

```js
{
  id,             // crypto.randomUUID()
  completedAt,    // ISO 8601
  quizType,       // "choice" | "pairs"
  score,          // correct count
  total,          // the SHOWN denominator — see §2.2
  skippedCount,   // 0 for choice
  ungradedCount,  // 0 for choice
  lines,          // ["kanji","vocab"] — which content lines the run drew on
}
```

`recordRun` builds this itself rather than accepting one wholesale, so
`id` and `completedAt` cannot be forgotten and the shape cannot drift
between the two callers.

**This is the interface epic 015 submits.** It was settled here so that
ranking inherits it rather than negotiating with it.

### 3.2 Retention

200 runs, oldest pruned on write. A record is ~150 bytes against a ~5 MB
budget, so the cap is hygiene rather than capacity — an append-only list
with no ceiling is a slow leak whether or not it ever becomes a large
one. Nothing depends on the number and the envelope is versioned, so it
can move without a migration.

### 3.3 Nothing derived is stored

`readStats()` recomputes totals, per-type accuracy and the best run from
the array on every call. A stored counter and a stored list can disagree,
and then there are two truths with no way to tell which is stale.

---

## 4. API Surface

**None.** This epic adds no endpoint and calls none. Listed explicitly
rather than omitted, because "scoring" reads like something that would
have a server behind it, and the absence is a decision (§2.1) rather than
an oversight.

---

## 5. Frontend Components

| path | purpose |
|---|---|
| `src/stores/scoreStore.js` | the store: `recordRun` / `readRuns` / `readStats` / `clearRuns` |
| `src/pages/ProgressPage.jsx` | the fourth top-level view; empty state, clear-with-confirm |
| `src/components/progress/ProgressStats.jsx` | lifetime tiles — accuracy, runs, per-type split, best run |
| `src/components/progress/RunList.jsx` | recent runs, newest first, with skipped/unchecked asides |
| `src/components/quiz/QuizRunner.jsx` | extracted from `App.jsx`; records on complete |
| `src/components/quiz/PairWritingRunner.jsx` | same, with `gradedCount` as the denominator |
| `src/utils/runLines.js` | `linesOf()` — which content lines a run drew on |
| `src/utils/quizTypeLabel.js` | `labelFor()` — display name for a `quizType` |

Styles are three new modules in `src/styles/`, role tokens only.

---

## 6. Decisions

### 6.1 Three epics, not one

The original request bundled scoring and ranking together. They were
split because they have opposite risk profiles and the seam between them
is clean: scoring needs no infrastructure at all, while ranking needs a
table, a migration, a deploy, an unauthenticated write endpoint and an
abuse story. Bundling them means one branch where half the diff cannot be
reviewed the same way as the other half.

The decisive argument was that scoring stands alone as a shippable
feature — the app was discarding every result, and persisted history is
something a learner notices. The `sento:profile` record turned out to
belong to *ranking*, not to a shared foundation: `displayName` exists
only for the leaderboard, and `deviceId` only became needed elsewhere
once the AI quota work (016) was scoped, at which point it stopped being
written and read together with the name at all.

### 6.2 Record on `complete`, not on `onFinish`

`onFinish` fires on the Finish *button*. A learner who reaches the
summary and closes the tab would lose the run they just finished — the
one moment the record is most worth having. Quitting mid-run still
records nothing; an abandoned run is not a result.

### 6.3 The two call sites are not unified

`QuizRunner` stores `total: totalQuestions`; `PairWritingRunner` stores
`total: gradedCount`. For a choice quiz those coincide. A shared
"build the record" helper is precisely how the two would stop differing
in the one field that matters, so there isn't one.

What *is* shared is `linesOf()`, which is genuinely the same question for
both and is nowhere near the field that is easy to get wrong.

### 6.4 The Progress view reads storage once, at mount

`App.jsx` switch-renders the views, so `ProgressPage` is unmounted
whenever the learner is elsewhere — and a run can only be recorded while
a quiz is active, which is to say while this page is not mounted. There
is nothing to subscribe to and nothing that can go stale underneath it.
Clearing is the one path that mutates the store from this page, and it
sets state explicitly.

### 6.5 Tests live in `frontend/tests/`, and the runner enforces it

Mirroring `backend/tests/` rather than colocating beside source. Vitest's
`include` is pinned to that directory instead of its default
`**/*.test.*`: the pin is what makes the convention self-enforcing, since
an unpinned runner happily picks up a stray colocated test and quietly
establishes the opposite habit.

CI's `hashFiles` condition takes **two** patterns rather than one brace
expression, because `@actions/glob` does not expand braces —
`'*.test.{js,jsx}'` matches nothing at all, so the step would skip and the
run would report green having executed zero tests.

---

## 7. Build Plan

One branch and one PR per phase, stacked.

| phase | branch | PR |
|---|---|---|
| 0 | `chore/test-harness` | [#156](https://github.com/phill-tam/sento/pull/156) |
| 1 | `feat/score-store` | [#157](https://github.com/phill-tam/sento/pull/157) |
| 2 | `feat/record-quiz-runs` | [#158](https://github.com/phill-tam/sento/pull/158) |
| 3 | `feat/progress-view` | [#159](https://github.com/phill-tam/sento/pull/159) |
| 4 | `docs/scoring-epic` | this doc |

---

## 8. What Actually Shipped, and Where It Differed

Four things went differently from the plan. All four are worth keeping.

### 8.1 The StrictMode reasoning was wrong

The plan, the issue and the first draft of the code comments all said the
`recorded` ref existed because `<StrictMode>` double-invokes effects and
would otherwise write every run twice.

Measured under test, that is not what happens. StrictMode does double-
invoke on mount, but the recording effect returns early there — the run
is not complete yet — so that path records nothing twice. What the latch
actually guards is **re-entry after completion**: the effect re-runs on
any dependency identity change, so a parent re-render handing down a
fresh `selectedItems` array while the summary is on screen records the
same run again.

This surfaced from mutation-testing, not from review. The first tests
wrapped everything in `<StrictMode>` and asserted a single record — and
passed with the latch deleted. A test incapable of failing is worse than
no test, and this one was written specifically to prevent that class of
false assurance.

### 8.2 Node 20 was end-of-life and nothing had noticed

CI pinned Node 20, which reached EOL on 2026-04-30. Nothing forced the
issue until the harness went looking at what current test tooling
supports. Bumped to 22 in its own commit, with the honest caveat recorded
in the commit body: the harness pins `jsdom ^29`, which still supports
Node 20, so nothing in that phase strictly *required* the bump. The EOL
was the reason on its own.

### 8.3 `localStorage` is undefined in a default Vitest jsdom environment

Node 22.4+ ships its own experimental Web Storage global. Where it is
enabled but unconfigured (no `--localstorage-file`) it installs an
accessor yielding `undefined`, and Vitest's jsdom environment will not
overwrite a global that already exists — so Node's dead one wins and
jsdom's real Storage, still on the window as `_localStorage`, is
unreachable under its own name. `typeof window` passes throughout, so it
presents as "jsdom is not loading" when jsdom is loading fine.

Two tidier fixes do not work: `poolOptions.forks.execArgv
['--no-experimental-webstorage']` never reaches the process that installs
the global, and `NODE_OPTIONS` needs shell-specific syntax on Windows or
a `cross-env` dependency. `tests/setup.js` carries a **guarded** re-point
at `window._localStorage` instead — guarded because that is a jsdom
internal, so if it disappears the harness test fails by name rather than
every storage-touching suite failing obscurely.

Whether any of this bites depends on the Node version, so left alone the
suite would pass on CI's Node 22 and fail on a developer's Node 26.

### 8.4 Two relocations that were not in the plan

Both were prompted mid-epic and both are pure moves, each in its own
commit so that every hunk reads as a no-op:

- **`src/stores/`** — `src/` root had accumulated three store modules
  beside `App.jsx`, `api.js`, `errors.js` and `main.jsx`. `api.js` and
  `errors.js` stayed put deliberately: the first is the HTTP client, not
  a store, and the second is shared by both it and the local store.
  Moving either would assert a boundary that is not there.
- **`components/quiz/{QuizRunner,PairWritingRunner}.jsx`** — the last two
  components still defined inside `App.jsx`, while every sibling already
  lived in `components/quiz/`. Epic 6 promoted them into `App.jsx` to get
  them above the view switch; the module-level *position* was the point,
  the definition being there was incidental. The immediate reason to move
  them was testability: both bugs in §8.1 are only observable by mounting
  a runner in isolation.

---

## 9. Planned Upgrades

- **Surface unavailable storage** (v1). Writes swallow, so a learner in
  private browsing gets a permanently empty Progress page with no
  explanation. The fix is to report it the way
  `components/generator/StorageNotices.jsx` already does for the
  generator — which also needs the quarantined-key list that
  `scoreStore` deliberately does not keep yet.
- **Per-line and per-item accuracy.** `useQuiz` exposes a running total,
  not which answers were right; adding it means changing the hook. `lines`
  is recorded now so the data is not lost in the meantime.
- **Backend tests for 015/016.** Out of scope here — this epic has no
  backend — but a leaderboard endpoint and a quota limiter are far better
  pytest targets than anything shipped so far, and `backend-ci.yml`
  already provisions a Postgres 16 service.

---

## 10. Open Questions

- **Does `getStorageStatus()` get lifted out of `localSentenceStore.js`?**
  The v1 storage notice wants it, but reaching across muddies the
  boundary epic 013 drew; extracting the availability probe into a shared
  util is the alternative. Deferred on purpose — not worth paying for
  while the notice does not exist, and there is only one real caller to
  shape it against.
- **Retention.** 200 runs is a guess at "enough history to be
  interesting, small enough not to think about". Nothing depends on it.
- **Visual verification.** Phase 3 was verified through tests and the
  build, not rendered in a browser, so the two themes and the 1024px
  breakpoint went unconfirmed by eye at merge time.
