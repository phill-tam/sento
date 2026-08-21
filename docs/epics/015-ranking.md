# Epic 015 — Ranking: Device-Scoped Leaderboard

Epic 014 gave every learner a private run history. This epic makes a
slice of it comparable across learners: an unauthenticated,
device-scoped leaderboard, built on top of `scoreStore.js` without
changing it.

**Entirely opt-in and honor-system.** There is no `User` model anywhere
in this project (ADR 011) and this epic does not add one. Identity is a
client-generated `deviceId` — the first table in this codebase that is
*intentionally and permanently* a shared, unattributed pile, rather than
an interim gap waiting on auth. See ADR 021 for the full trust-model
reasoning; this doc covers architecture and what shipped.

Third of three related pieces of work, split in #155:

| epic | what | needs a server? |
|---|---|---|
| 014 (shipped) | run history in the browser, Progress view | no |
| **015 (this)** | `sento:deviceId`, `sento:displayName`, `POST`/`GET /leaderboard` | yes |
| 016 (next) | per-device AI quota on the two AI endpoints | yes |

**Status:** shipped. **Docs/ADRs:** [ADR 021](../adr/021-anonymous-leaderboard-trust-model.md), reserved by #155 since 014 had already claimed ADR 020. **Flags:** none, deliberately — see ADR 021's "unconditional mount" decision. **Issue:** [#161](https://github.com/phill-tam/sento/issues/161).

---

## 2. Architecture Overview

```
identityStore.js ──┐
                    ├──► useLeaderboard ──► ProgressPage
scoreStore.js ──────┘         │                 │
                               ▼                 ▼
                          api.js          LeaderboardSyncDialog
                               │            LeaderboardList
                               ▼
                    POST/GET /api/v1/leaderboard
                               │
                    leaderboard_service.py
                               │
                    leaderboard_devices / leaderboard_runs
```

### 2.1 Submission is idempotent by construction, never a stored total

`leaderboard_runs` stores one row per submitted run, keyed on **the
run's own id** — `scoreStore.recordRun`'s existing `crypto.randomUUID()`,
already stamped on every local record before this epic touched anything.
The client resubmits its whole capped history (`scoreStore`'s existing
200-run cap) on every sync; the service upserts by run id
(`ON CONFLICT DO NOTHING`), so a replay or a resync of already-stored
runs changes nothing. The board itself is `SUM(score) GROUP BY device_id`
over that table, computed fresh on every read — nothing server-side ever
holds or increments a running total. `leaderboard_service.py`'s own
docstring calls this out as the load-bearing choice in the whole design.

A device's `display_name` is the other half of the same submission and
upserts differently — `ON CONFLICT DO UPDATE`, since a resubmission under
a new name is a rename and the endpoint has no other way to change one.

### 2.2 Identity is two ordinary preference keys, not a shared record

`sento:deviceId` and `sento:displayName`, in `stores/identityStore.js`.
The original plan (#155, and CLAUDE.md before this epic corrected it) had
these as one `sento:profile` record. That stopped holding once epic 016
was scoped: `deviceId` gained a second, unrelated consumer (the AI quota
limiter) and no longer has a single "read and written together"
lifecycle with `displayName`. `identityStore.js` is a plain module rather
than a hook, unlike `sento:theme`/`sento:romaji` — `api.js` needs to read
`deviceId` outside any component, and epic 016 will read it again.

### 2.3 The board never exposes a raw `device_id`

`deviceId` functions as a bearer credential — whoever holds it can
submit runs and rename that device. `LeaderboardEntry` therefore carries
`device_hash`, a truncated SHA-256 of the id computed server-side
(`leaderboard_service._hash_device_id`), never the id itself. This is
checked directly by a test (`test_never_exposes_the_raw_device_id`),
not just implied by the schema's field list, since a future field added
carelessly is exactly the mistake ADR 021 exists to prevent.

### 2.4 The storage-error convention splits the same way ADR 020 requires

`scoreStore` writes swallow silently (a score is bookkeeping about an
activity that already happened). `useLeaderboard.sync` does **not**
inherit that: ADR 020 says explicitly that a leaderboard submission is
an action the user asked for and is waiting on, so a failure sets
`syncError` and the dialog stays open showing it, rather than
disappearing.

---

## 3. Data Model

### 3.1 `LeaderboardDevice`

| column | type | notes |
|---|---|---|
| `id` | UUID, PK | client-generated (`identityStore.getDeviceId()`), **not** `default=uuid4` — the one deviation from every other model in this codebase |
| `display_name` | `String(20)` | not null; no uniqueness constraint (ADR 021) |
| `created_at` | timestamptz | server default `now()` |

### 3.2 `LeaderboardRun`

| column | type | notes |
|---|---|---|
| `id` | UUID, PK | the run's own id from `scoreStore.recordRun`, client-generated |
| `device_id` | UUID, FK → `leaderboard_devices.id`, `ondelete="CASCADE"`, indexed | |
| `quiz_type` | enum `LeaderboardQuizType` (`CHOICE`/`PAIRS`) | mirrors `scoreStore.js`'s `quizType`, scoped to this one model |
| `score`, `total` | Integer | `score <= total` enforced at the schema layer, not the DB |
| `completed_at` | timestamptz | from the client's `scoreStore` record, not server-stamped — the run can have finished well before it's synced |
| `created_at` | timestamptz | server default `now()` |

Migration `24d59c83439d` — see §8.1 for a real bug found and fixed while
writing it.

---

## 4. API Surface

| method | path | gate | description |
|---|---|---|---|
| `POST` | `/api/v1/leaderboard` | none — unconditional (ADR 021) | Upserts a device's `display_name` and a batch of runs (`ON CONFLICT DO NOTHING` per run id). Returns `accepted_runs`, the device's `total_score`, and `device_hash`. |
| `GET` | `/api/v1/leaderboard` | none | The board — `LeaderboardEntry[]` ranked by `total_score` descending, no pagination. |

Both mounted unconditionally in `api/v1/router.py`, in the always-on
block — the first router in this codebase that isn't behind
`admin_writes_enabled`/`sentence_persistence_enabled`-style access
control, because there is no state in which public reachability is a
mistake to gate against for this one (ADR 021).

---

## 5. Frontend Components

| path | purpose |
|---|---|
| `src/stores/identityStore.js` | `getDeviceId` / `getDisplayName` / `setDisplayName` |
| `src/hooks/useLeaderboard.js` | loads the board on mount; `sync(name)` is the explicit submit action |
| `src/components/progress/LeaderboardList.jsx` | the board, keyed by index (not `device_hash` — collisions are accepted, ADR 021) |
| `src/components/progress/LeaderboardSyncDialog.jsx` | name entry + sync; states plainly that names aren't unique or verified |
| `src/pages/ProgressPage.jsx` | wires the section in; two-column grid with the board pinned left on wide layouts (§8.3) |

`api.js` gains `submitLeaderboardRuns` / `fetchLeaderboard`. Styles are
new modules plus one new role token, `--progress-btn-bg` (§8.3).

---

## 6. Decisions

### 6.1 Ranks cumulative correct answers, not best-run accuracy

Rewards consistent study over one lucky run, and is self-limiting
against short-run gaming with no minimum-length rule needed: a 1/1 run
contributes exactly 1. This was an explicit choice among three options
(best single run, cumulative correct, best-run-rolling-7-days) — best
single run would have needed a minimum-run-length rule to stop a 1/1
run from topping the board; cumulative avoids that by construction.

### 6.2 Two different upsert shapes on the same submission, on purpose

Covered in §2.1. Worth restating as a decision: a shared "upsert
everything the same way" helper was never written, because the two
tables need opposite conflict behaviour and collapsing them into one
helper is exactly how a run's `DO NOTHING` guarantee would get
accidentally weakened to `DO UPDATE` later.

### 6.3 The discriminator is a server-computed hash, never a client-side derivation

Covered in §2.3. The corollary that shaped the schema: `SubmitLeaderboardResponse`
returns `device_hash` on every submit specifically so the frontend never
needs a second implementation of the hash function to recognise its own
row in a fetched board — one algorithm, one place, matching ADR 021's
framing that the hash must be provably one-way.

### 6.4 No rate limiter shared with the AI endpoints

Considered and rejected in ADR 021: `POST /leaderboard` and the AI
endpoints protect different things (table growth/payload size vs. paid
provider quota per call), so building a shared limiter now — with only
this one real caller — would repeat the mistake ADR 018 already
documents (`SentenceProvider.generate()`, shaped around one feature and
torn down when a second arrived). If epic 016 ships a reusable Postgres
counter helper, this endpoint can adopt it then.

---

## 7. Build Plan

One branch and one PR per phase, stacked — matching epic 014's
convention.

| phase | branch | PR |
|---|---|---|
| 0 | `chore/leaderboard-prep` | [#162](https://github.com/phill-tam/sento/pull/162) |
| 1 | `feat/identity-store` | [#163](https://github.com/phill-tam/sento/pull/163) |
| 2 | `feat/leaderboard-backend` | [#164](https://github.com/phill-tam/sento/pull/164) |
| 3 | `feat/leaderboard-frontend` | [#165](https://github.com/phill-tam/sento/pull/165) |
| 4 | `docs/epic-015` | this doc |

**Phase 0** — corrected the stale `sento:profile` references in
CLAUDE.md and the epic 014 writeup (§2.2 predates this epic's own
start); stood up `backend/tests/conftest.py` (a `TestClient` +
per-test-transaction `db_session` fixture) and a minimal `fetch`-mocking
convention for `frontend/tests/` — both gap-checked infra this epic was
the first to need, landed once rather than improvised inline. See §8.2
for a real bug found here too, just not caught until phase 3.

**Phase 1** — ADR 021 in full, plus `identityStore.js`.

**Phase 2** — models, migration, schemas, service, route, unconditional
mount, 17 tests. See §8.1 for two real bugs caught and fixed while
building this phase, not assumed away.

**Phase 3** — `api.js`, `useLeaderboard`, the dialog, the list, wired
into `ProgressPage`. See §8.2 for a third bug this phase's own test
surfaced in phase 0's infra.

---

## 8. What Actually Shipped, and Where It Differed

Three real bugs, caught by actually running things rather than trusting
plausible-looking code — and two rounds of follow-up work requested
after phase 3 shipped, both about how the Progress page looks rather
than how the feature works.

### 8.1 Two bugs in the backend, both found by running the migration and a smoke test for real

**The migration's `downgrade()` orphaned a Postgres ENUM type.**
Autogenerate emits `sa.Enum(...)`'s `CREATE TYPE` on `upgrade()` but no
matching `DROP TYPE` on `downgrade()`, so a downgrade followed by another
upgrade failed with "type already exists" — reproduced by actually
running the round-trip against local Postgres, not assumed safe because
it looked like every other autogenerated migration. Fixed the same way
`caf69c4b502d`'s `content_status`/`content_source` already had to: an
explicit `.drop()`, after the table that references it. Verified with
three full up/down cycles in a row, not just one.

**`result.rowcount` lied about how many rows a batch `ON CONFLICT DO
NOTHING` insert actually wrote.** A manual smoke test — before any
automated test existed to hide behind the wrong assumption — showed
`accepted_runs: -1` instead of `1` on a first submission. psycopg
reports `-1` (unknown) for this statement shape rather than the real
count. Fixed with `.returning()` and counting what actually comes back,
since a row skipped by `DO NOTHING` is never returned. Both bugs are
covered by regression tests now (`test_leaderboard_service.py`).

### 8.2 A third bug, in already-merged phase-0 infra, found by phase 3's more realistic test

`fetchMock.js`'s `mockFetchOnce` re-installed a fresh `vi.fn()` — with
empty `.mock.calls` — every time its queue transitioned from empty to
non-empty, rather than staying installed for the whole test. Every
caller before phase 3 only ever made one `fetch` call per test, so this
was invisible until the leaderboard sync test's real multi-call sequence
(mount `GET`, dialog `POST`, refetch `GET`) needed to inspect a call made
*before* the queue had drained and refilled. Fixed by tracking
installation with an explicit flag instead of inferring it from queue
state, with a regression test (`fetchMock.test.js`) exercising the exact
drained-then-refilled sequence that had shipped untested in #162.

### 8.3 Two rounds of follow-up styling, requested after phase 3 merged

Neither was in the original plan; both landed as their own small PRs
rather than being folded backward into phase 3's history.

- **Gold border/text, teal wash on the secondary buttons**
  ([#166](https://github.com/phill-tam/sento/pull/166)) — a new role
  token, `--progress-btn-bg` (day: a teal-mid wash; night: plain
  transparent), following the same "bespoke day look, night re-points to
  the ordinary shared value" pattern `QuizCard`/`PairPromptCard` already
  use. Caught one bug applying it: the existing `:hover` rule set
  `background:` directly, which — same property, same specificity,
  declared later — would have replaced the new base colour outright
  instead of tinting it, the exact trap CLAUDE.md already documents
  happening once with `QuizCard`'s `.correct`/`.incorrect` washes. Fixed
  with `background-image` and a flat-stop gradient, which layers instead
  of overriding. Tuned twice more by request (opacity 0.12 → 0.24 → 0.6).
- **Leaderboard moved to a left column on wide layouts**
  ([#167](https://github.com/phill-tam/sento/pull/167)) — above the
  shell's existing 1024px breakpoint (the same query string
  `AppShell.module.css`'s other five use, not a new value), a two-column
  grid with the board pinned to 100% of the panel's height in its own
  scroller; below it, the layout is exactly what phase 3 shipped. The
  board is placed left via CSS Grid `grid-column`, **not** `order` —
  it stays second in the DOM, so the narrow layout's tab order and
  reading order (local history first) are unaffected; only the desktop
  grid's visual placement changes.

Neither round was visually verified in a browser — no browser tool was
available in the sessions that built them. See §10.

---

## 9. Planned Upgrades

- **The six accepted gaps in ADR 021** — all genuinely require the auth
  epic, not a partial mitigation. Do not attempt per-endpoint anti-cheat
  or signature schemes in the meantime.
- **Epic 016's quota limiter** should reuse phase 0's `conftest.py`
  fixtures rather than inventing its own — they're deliberately
  general-purpose, not leaderboard-specific.
- **A shared rate-limit mechanism**, once epic 016 has a real second
  caller to shape it against (§6.4) — a generic Postgres counter helper
  with per-endpoint policy, not a second `get_provider()`-style switch.

---

## 10. Open Questions

- **Visual verification.** Every phase after the first was verified
  through lint/tests/build, never rendered in a browser — no browser
  tool was available in any of the sessions that built this epic. The
  two themes, the 1024px breakpoint's transition, and the exact gold/teal
  button treatment have never been confirmed by eye.
- **Discriminator collisions.** `device_hash` is 4 hex characters
  (65,536 possible values) and collisions are an accepted display
  property, not a bug (ADR 021) — worth revisiting only if the board
  ever grows large enough for a collision to be a realistic occurrence
  rather than a curiosity.
- **Board size / pagination.** Flagged in #161 and still unresolved: a
  single unbounded `GROUP BY` is fine at this project's realistic scale;
  revisit if it ever isn't.
