# Epic 013 — Local Sentence Storage: the Prod DB Stops Taking Anonymous Writes

**Status:** Complete — phases 0–4 shipped and merged; phase 5 (the
production purge) is a manual step documented in
`backend/scripts/purge_production_sentences.md` and run by hand.
**Repo:** sento
**Scope:** Backend (FastAPI) + Frontend (React/Vite)
**Issue:** [#128](https://github.com/phill-tam/sento/issues/128)

---

## 1. Problem Statement

`generated_sentences` and `sentence_folders` are written by anyone who
can reach the API. There is no authentication anywhere in this project
and no `User` model, so every saved sentence in the production database
belongs to nobody in particular — the table is a single shared pile that
every visitor reads and writes at once.

That is tolerable for a solo study app and untenable for anything past
it. Two people using the deployed frontend today see each other's
sentences, can relocate each other's rows between folders, and can
delete them.

The eventual answer is authentication, and the production tables are
being **reserved** for that: once auth lands, a row in
`generated_sentences` will mean "this signed-in person kept this
sentence." **Auth is explicitly out of scope for this epic** and gets its
own plan. What this epic does is stop the bleeding in the meantime, and
do it in a way that the auth epic can build on instead of unwind:

- anonymous users keep the generator in full, with their saved sentences
  persisted **in their own browser**;
- the production persistence endpoints stop being reachable;
- the existing production rows are purged.

The app must keep working with no accounts, no configuration and no new
infrastructure — the same posture ADR 012 left it in.

---

## 2. Architecture Overview

**The browser becomes the store of record for saved sentences.
Generation stays on the server.**

That split falls out of what each half actually needs. Generation needs
a provider API key, which cannot go client-side, so
`POST /sentences/generate` is untouched. Persistence needs nothing but
somewhere to put bytes. And the seam between them already exists in the
data model: candidates from a generation round are ephemeral frontend
state and only a Save persists anything
(`models/sentence_entry.py`, class docstring). This epic relocates Save.
It does not touch the generator.

### 2.1 Redis is not part of this

The original sketch for this work paired local storage with a Redis
cache. It does not fit and is deliberately excluded.

Redis is a server-side shared store. "Each user keeps their own
sentences" is a client-side property. Putting anonymous sentences in
Redis would move the exact problem from Postgres to Redis — still on our
infrastructure, still unattributed, still one shared pile — while adding
a service to the deploy. There is no cache to add here either: the
records never leave the machine that wrote them, so there is nothing for
a server-side cache to sit in front of.

Redis has real work in this codebase, but none of it is this epic. See
Section 8.

### 2.2 The seam is a module boundary, not a runtime switch

`App.jsx` currently imports eight persistence functions directly from
`api.js` (lines 7–13). It will import them from a new `sentenceStore.js`
instead, with identical names and identical signatures. Every handler in
`App.jsx` (lines 336–376) keeps its current body.

In this epic `sentenceStore.js` re-exports the local implementation and
nothing else — **there is no local/remote branch yet**, because with
auth out of scope there is nothing to branch on. Building the switch now
would be one untestable branch guarding a code path no caller can reach.
What this epic builds is the *boundary*: once auth exists, the switch is
a few lines inside `sentenceStore.js` and no consumer changes. That is
the same shape as the backend's `get_provider()`, which is the only
place that knows which AI provider served a request.

### 2.3 Local records are server-shaped, on purpose

A locally stored sentence uses the exact field names the API returns —
`id`, `jp_text`, `reading`, `romaji`, `meaning_en`, `folder_id`,
`source_item_refs`, `created_at` — and folders use `id`, `name`,
`created_at`.

This is what keeps the blast radius at one file. `SentenceListItem`,
`SentenceFolderTree`, the quiz pool adapter in `App.jsx` and
`useQuiz`'s sentence branch all read those fields directly, in line with
the codebase's standing choice not to camelCase API responses. It is
also what makes the future import cheap: the payload is the stored blob,
with no shape-translation layer.

`useQuiz` needs no changes at all. Its sentence branch resolves
`source_item_refs` against the in-memory `globalPool`
(`hooks/useQuiz.js:28-34`), never against the API, so locally stored
sentences feed the global quiz pool exactly as server ones did — as long
as `source_item_refs` survives the round trip, which is why it is stored
verbatim rather than reduced to ids.

### 2.4 The server endpoints are unmounted, not deleted

The frontend no longer calling the persistence endpoints does not
reserve anything. `POST /sentences`, `PATCH /sentences/{id}`,
`DELETE /sentences/{id}` and the whole of `/sentence-folders` remain
unauthenticated public writes into the production database whether or
not our own UI uses them.

So they get the treatment `admin_router` already gets: split onto a
second router, mounted only when a setting says so, default off. This is
access control standing in for absent auth, **not** a feature flag — the
same distinction ADR 012 draws for `ADMIN_WRITES_ENABLED`, and the
reason it survived the flag purge. The tables, models and Alembic
history all stay exactly where they are; the auth epic flips the setting
on and adds `user_id` scoping behind it.

---

## 3. Data Model

**No schema changes.** No migration is generated by this epic.

### 3.1 Client-side storage

Keys follow the existing prefix convention, and sentences are keyed
**per folder** — the same `prefix:{id}` shape `sento:mastered:{lineId}`
already uses:

| key | contents |
|---|---|
| `sento:folders` | `{ "v": 1, "items": [ …SentenceFolder… ] }` |
| `sento:sentences:{folderId}` | `{ "v": 1, "items": [ …GeneratedSentence… ] }` |
| `sento:sentences:uncategorized` | the same, for `folder_id: null` |

Uncategorized needs a literal key segment because `null` cannot be one.
It is a real key, not a magic folder — nothing creates a `SentenceFolder`
row for it, matching the server's treatment of `folder_id: null` as a
permanent valid state rather than a default folder.

Per-folder keying means a save rewrites one folder's blob instead of the
whole library. It costs three things, all of them manageable and all of
them worth writing down:

**The unscoped read fans out.** `getSentences()` with no folder — used
twice in `App.jsx` (lines 336 and 438) to build the global quiz pool —
must read the folder list, then every folder's key, then uncategorized,
and concatenate. Tiny at this scale, but it is now a loop rather than
one `getItem`.

**Relocate is a two-key write with no transaction.** `moveSentence` adds
to the destination and removes from the source, and `localStorage` has
no way to make that atomic. **Write the destination first, then remove
from the source.** A failure between the two then leaves a visible
duplicate, which the user can fix; the other order leaves nothing, which
they cannot.

**Keys can be orphaned.** Deleting a folder must delete its sentence key
too, or the entry leaks. A sentence key whose folder is absent from
`sento:folders` is a recoverable-state case, not garbage to collect —
see below.

Two deliberate departures from the preference conventions in CLAUDE.md:

**These are datasets, not preferences,** so they carry a versioned
envelope rather than being raw values. The envelope is the only thing
that makes a future shape change migratable in a store we cannot run
migrations against.

**Unreadable data is quarantined, never discarded.** An earlier draft of
this doc specified the reader as `if (parsed.v !== 1) return []`. That is
wrong, and it is wrong in the most expensive possible place: it silently
destroys the user's entire library at exactly the moment something has
already gone unexpectedly wrong. On an unknown version, a failed
`JSON.parse`, or a shape that does not match, **rename the key to
`sento:sentences:{folderId}:quarantine:{timestamp}` and surface a
recoverable-state notice**, then continue with an empty list. The data
stays on disk, the user is told, and nothing is lost to a bug in our own
reader. Same rule for orphaned keys.

**Storage failure must not be silent.** The preference convention is a
try/catch that degrades quietly, which is right for a muted-volume flag
and wrong for the only copy of a user's data. Private browsing and
blocked-storage modes throw on write, and a save that vanishes without a
word is the worst failure this feature can have. Probe storage
availability once at boot and surface a persistent notice on the
generator when it is unavailable; surface a `QuotaExceededError` on save
as a real, visible error.

Capacity is not a practical concern — a sentence record is roughly
300 bytes of JSON, so the ~5 MB budget holds well over ten thousand of
them — but the error path exists regardless, because storage can be
unavailable for reasons that have nothing to do with size.

### 3.2 Production data purge

The existing production rows are deleted — **both tables, sentences and
folders**. A folder with no sentences under it is a name with nothing
behind it; there is nothing there worth reserving for the auth epic.

This is a **one-off SQL script run against production only**, and
explicitly *not* an Alembic revision:
a revision containing `DELETE FROM generated_sentences` would run
wherever `alembic upgrade head` runs, including local development, which
is the one database this decision says to leave alone.

Order matters (`generated_sentences.folder_id` is `ondelete="RESTRICT"`):
sentences first, then folders. Take a `pg_dump` of both tables before
running it. The deletion is irreversible and the dump costs nothing.

---

## 4. API Surface

No endpoint changes shape. What changes is which ones are mounted.

**`app/routes/sentences.py`** splits into two routers, mirroring the
`router` / `admin_router` pattern in `routes/{kanji,vocab,grammar}.py`:

| router | endpoints | mounted |
|---|---|---|
| `router` | `POST /sentences/generate` | always |
| `persistence_router` | `POST /sentences`, `GET /sentences`, `PATCH /sentences/{id}`, `DELETE /sentences/{id}` | gated |

**`app/routes/sentence_folders.py`** is persistence in its entirety; its
`router` is renamed `persistence_router` and gated whole.

`app/config/settings.py` gains:

```python
# Mounts the unauthenticated sentence/folder persistence endpoints.
# Like admin_writes_enabled, this is access control standing in for the
# auth this project does not have (ADR 012), not an epic gate. Saved
# sentences live in the browser until auth lands (epic 013); these
# routes write an unattributed shared pile into whatever database they
# are pointed at. Leave false anywhere reachable by anyone else.
sentence_persistence_enabled: bool = False
```

`api/v1/router.py` mounts the two persistence routers under that flag,
beside the existing `admin_writes_enabled` block. Local development sets
it true in `.env` to exercise the server path; production leaves it
false until the auth epic.

`POST /sentences/generate` remains unconditionally mounted and
unauthenticated, with the provider's own rate limit as the only
backstop. That is unchanged by this epic and remains the accepted gap
ADR 012 records. See Section 8.

---

## 5. Frontend Components

Two new files, both at `src/` beside `api.js` — no new directory for two
modules, and they are peers of `api.js` rather than helpers under
`utils/`.

**`src/sentenceStore.js`** — the boundary. Exports the eight persistence
functions with the same names and signatures `api.js` uses today. In
this epic the body of each is a re-export of the local implementation.

**`src/localSentenceStore.js`** — the implementation. Reads and writes
the two keys, and carries the three things the server used to provide:

- **IDs.** `crypto.randomUUID()`, already the pattern for `_tempId` in
  `useSentenceGenerator`.
- **Invariants.** Deleting a non-empty folder throws an `ApiError` with
  `status: 409`; saving into or relocating to an unknown folder throws
  `status: 404`. Throwing the same error shapes `api.js` throws is what
  keeps callers unchanged — this is business logic that now exists in
  two places, and Section 7.2 covers what that costs.
- **`created_at`.** `new Date().toISOString()`, so ordering and display
  behave as they do today.

Two edits at the call sites:

- **`App.jsx`** — the eight imports move from `./api` to
  `./sentenceStore`. Lines 336–376 are untouched.
- **`useSentenceGenerator.js`** — `saveSentences` moves to
  `../sentenceStore`; `generateSentences` and `RateLimitError` stay on
  `../api`. That one line is the entire local/remote split made visible.

And three component changes, all consequences of §6.4 and §6.5:

- **`SentenceListItem`** gains a `ConfirmDialog` gate on delete
  (§6.4). `ConfirmDialog` itself is reused unchanged.
- **`SentenceList`** (or `GeneratePage`, wherever the list header sits)
  carries the permanent "stored in this browser" line (§6.5).
- **The same slot** renders the storage-unavailable and quarantine
  notices — different styling, different copy, not the same component.

CSS: one new module for the notice slot. Role tokens only
(ADR 013).

---

## 6. Decisions

### 6.1 The browser, not Redis, and not a server-side anonymous session

Rejected: keying anonymous sentences to a client-generated session id
and storing them server-side in Redis with a TTL. It reads as a middle
path and is worse than both ends. It still stores unattributed user data
on our infrastructure, it adds a service to the deploy, it makes data
loss a *scheduled* event rather than a user action, and the session id
in local storage is doing the same job local storage would have done
directly — with a network hop and an eviction policy attached.

Local storage costs nothing, needs no infrastructure, is genuinely the
user's own machine, and hands the auth epic a blob it can POST once.

### 6.2 One-shot import at login, not sync

Recorded here because it constrains what this epic must build, even
though the import itself belongs to the auth epic.

The rule is **import on transition**: when a browser goes anonymous →
authenticated holding a non-empty local pile, it ships that pile once
and switches to the remote store. This is not once per user — it is once
per browser that has local data, and that is correct rather than
sloppy. Local storage is not shared between browsers, so the laptop pile
and the phone pile are disjoint sets the user really did create; the
union is what they expect. The consequence is that the "already
imported" guard lives on the **client** (clear or mark the blob after a
successful import) and never as a server-side "this user has imported"
flag, which would silently discard the second device.

Three consequences are being accepted:

**Logging out shows an empty app.** After import the local pile is gone,
so a logged-out session has nothing to show until the user signs back
in. The tempting fix — restoring the archived local copy on logout — is
the one thing that must not happen: it recreates a divergent second copy
that gets re-imported at the next login and duplicates the library.
Logout must render a deliberate "sign in to see your sentences" state.
This is a UI problem, and it is the sharpest edge of the decision.

**A lost response duplicates everything.** If the server commits and the
network drops before the client sees the response, the client cannot
distinguish success from failure, and a retry doubles the library. The
mitigation is not optional: the client generates an `import_id` UUID,
sends it with the payload, and the server treats a repeat of that id as
a no-op returning the original result. One column, one unique
constraint. It is the only piece of machinery one-shot cannot skip.

**Every local id dies at import.** The server mints fresh ids, so
`generatorFolders`, `generatorSentences`, `allGeneratorSentences` and —
the trap — `activeSentenceFolderId` are all stale the moment the
response lands, that last one pointing at a folder that no longer
exists. Discard local state wholesale and reload from the store rather
than patching ids in place, and reset `activeSentenceFolderId` to null.
(Having the server accept client UUIDs would remove the remap entirely,
at the cost of a client-chosen id colliding with an existing row and
failing the insert. Server-minted plus a full reload is more robust and
the reload is cheap here.)

What one-shot buys is everything sync would have required and does not:
a merge algorithm, delete tombstones, a clock or version vector,
conflict-resolution UI, a background sync loop, an offline write queue.
The three consequences above are roughly a paragraph of code each. What
it forecloses is anonymous multi-device merging — two browsers stay two
piles until each one logs in, and a user who never logs in never gets
cross-device. Accepted limitation, not a bug.

**What this epic must get right for it:** the versioned envelope (§3.1)
and server-shaped field names (§2.3). Both are cheap now and expensive
to retrofit under an import.

### 6.3 Anonymous users keep the whole app

Local storage is not a degraded waiting room. Generate, save, folder,
relocate, delete, and quiz on saved sentences all work signed-out,
because all of it already works without a server round trip once
persistence is local. When auth arrives, the local tier stays as the
anonymous tier rather than being replaced by a login wall — it will
already be built, and it matches the app's no-configuration posture.

### 6.4 Every destructive action confirms, because there is no second copy

Today a mis-click deletes a row from a shared server table. After this
epic it deletes the user's only copy of that sentence. The same gesture
changes category, and the UI has to change with it.

**`SentenceListItem` currently has no confirmation at all** —
`onClick={() => onDelete(sentence.id)}` fires straight from the button
(`SentenceListItem.jsx:143`). It gains a `ConfirmDialog` gate, reusing
the component unchanged; it already portals itself to `<body>`, so the
stacking problem that bit `SentenceFolderTree` does not recur.

Folder deletion already has its two gates (non-empty folders are not
offered, empty ones confirm) and needs nothing.

The rule generalises past the delete button, and this is the part worth
carrying forward: **anything that would drop locally stored sentences
warns first.** That covers the quarantine path in §3.1, which is why it
quarantines rather than discards, and it covers the auth epic's import,
which clears local storage on success and must confirm before it does.
An action that destroys the only copy without asking is a bug in this
epic's terms, wherever it appears later.

### 6.5 The device affordance is permanent, not dismissible

A line on the generator stating that saved sentences live in this
browser. Not a toast and not a dismissible banner.

The failure it prevents is silent and delayed: someone saves forty
sentences on their laptop, opens the app on their phone, and finds an
empty library with no explanation. A dismissible notice is dismissed
long before that moment arrives, which is precisely when it was needed.
So it is a quiet permanent line near the sentence list, not an alert —
it has to survive being read, because its whole job is to be there
months later.

It shares a slot with the storage-unavailable notice from §3.1 but not a
style. Those are two different states — "stored here, working" is
informational and should be nearly invisible; "storage blocked, saves
will not persist" is an error and should not be. Do not collapse them
into one component with a severity prop; they have different
persistence, different copy and different urgency.

### 6.6 The seam, but not the switch

Covered in §2.2. Stated as a decision because "add the branch now while
you're in here" is the obvious suggestion and it is wrong: a branch
whose second arm no caller can reach is untested by construction, and
the auth epic will have opinions about how auth state reaches
`sentenceStore.js` that we would be guessing at today.

---

## 7. Notable Implementation Details & Risks

### 7.1 `source_item_refs` point at server rows that local storage cannot see

A locally stored sentence references kanji/vocab/grammar ids that live
in the server's database. Those ids are stable in practice — the content
tables are seeded, not user-generated — but a re-seed that mints new
UUIDs would leave every local sentence with dangling refs.

The damage is bounded and worth knowing precisely:
`useQuiz.poolFor()` filters unresolvable refs out and falls back to
other sentences' meanings (`hooks/useQuiz.js:30-34`), so the quiz
degrades rather than breaking. Nothing else reads the refs. No defensive
work is needed; a re-seed against an environment with live local data is
just a thing to avoid.

### 7.2 The folder invariants now live in two places

`delete folder → 409 while non-empty` exists in
`routes/sentence_folders.py:66-70` and will exist again in
`localSentenceStore.js`. Duplicated business logic is a real cost and it
is being paid on purpose: the alternative is a shared rule module that
one implementation reaches through a database and the other through
`JSON.parse`, which is more machinery than the rule is worth.

Two notes for whoever implements it. The server-side rule is not dead
code — it is the invariant's backstop for whenever persistence is
mounted again, and it must not be removed. And the frontend does not
appear to catch the 409 at all, relying on the pre-flight
`ConfirmDialog` to make it unreachable; the local store should mirror
the existing behaviour rather than fix that in passing, but it is worth
filing separately.

### 7.3 Storage availability is a first-class state, not a catch block

Restating §3.1 because it is the detail most likely to be lost to
convention-following. Every other `localStorage` access in this codebase
swallows its exception, which is correct for preferences. Copying that
pattern here produces an app that accepts saves and discards them
silently in private browsing. Probe once at boot, hold the result, and
render it.

### 7.4 What is worth a test, given `backend/tests/` is empty

No backend logic changes, so nothing new is testable there. On the
frontend, `localSentenceStore.js` is the first module in this codebase
that is both pure-ish and genuinely worth testing — the 409 path, the
envelope version guard, and round-tripping a sentence with
`source_item_refs` intact. CI only runs the frontend test step if
`frontend/src/**/*.test.jsx` files exist, so adding the first one turns
that job on; that is a fine thing to do here but should be a deliberate
step, not a surprise in a PR.

### 7.5 The purge is a production data deletion

Called out separately from §3.2 because it is the only irreversible
action in the epic. Dump first, verify the dump, then delete. Run it
after the frontend change ships, not before — otherwise the deployed
frontend spends the gap reading an empty table it still believes in.

### 7.6 Relocate is the only multi-key write

Per-folder keying (§3.1) makes `moveSentence` the one operation that
touches two keys with no transaction between them. Destination first,
source second — the failure mode is then a visible duplicate rather than
a silent loss. This is also the operation most worth a test, because it
is the one where a plausible implementation (remove, then add) is wrong
in a way that only shows up under a failure nobody will reproduce by
hand.

---

## 8. Where Redis Actually Belongs (not this epic)

Recorded so the idea is not lost, and so it is not smuggled into this
epic where it does not fit.

1. **Rate-limiting `POST /sentences/generate`** — the real gap ADR 012
   accepts. A counter with a TTL, per user once auth exists and per IP
   before then. The strongest case, and the only one about correctness
   rather than speed.
2. **Caching the seeded content lists.** `App.jsx:405` fetches all three
   lines on every mount; they are static and identical for every
   visitor. One global key per line, invalidated on CSV upload and
   status PATCH. The highest hit rate available in this app.
3. **Per-user sentence lists,** after auth. The weakest: small, indexed,
   per-user, and invalidated on every save, relocate and delete. Skip it
   unless the Supabase pooler measures badly.

If (1) is the only need and the deploy is a single web process, a
Postgres counter row or an in-process limiter does the job with no new
infrastructure. Add Redis when there is a second process, or when (2)
becomes worth doing.

---

## 9. Build Plan

Ordered so the app is never in a state where saves go nowhere.

### Phase 1 — Local store (frontend, not yet wired)
`localSentenceStore.js` and `sentenceStore.js`: per-folder envelope
read/write, the quarantine path, id and timestamp minting, the eight
functions, the 409/404 error shapes, the storage-availability probe.
Relocate writes the destination before removing from the source; folder
delete removes the folder's sentence key. Nothing imports them yet, so
nothing can break.

### Phase 2 — Flip the call sites (frontend)
`App.jsx`'s eight imports and `useSentenceGenerator`'s `saveSentences`
import. Verify by hand: generate → keep → save → folder appears →
relocate → delete → reload the page → everything survives → start a
global quiz and confirm a saved sentence appears with sensible
distractors. Check the unscoped read specifically — the quiz pool is the
one caller that fans out across every folder key.

### Phase 3 — Notices and confirmation (frontend)
The permanent "stored in this browser" line (§6.5); the
storage-unavailable notice, tested in a private window; the quarantine
notice, tested by hand-writing a bad envelope into a key; the
`QuotaExceededError` error; and the `ConfirmDialog` gate on sentence
delete (§6.4).

### Phase 4 — Gate the routes (backend)
Split `sentences.py` into `router` + `persistence_router`, rename
`sentence_folders.router`, add `sentence_persistence_enabled`, mount
both under it in `api/v1/router.py`, add the var to `.env.example`.
Confirm `/sentences/generate` still answers and `GET /sentences` 404s
with the setting off.

### Phase 5 — Deploy, then purge (ops)
Ship frontend and backend. Confirm the deployed app saves locally and
the persistence endpoints 404. Then dump and purge production, in that
order, sentences before folders. Local development database untouched.

### Phase 6 — Docs
CLAUDE.md: the sentence-persistence gate beside the
`ADMIN_WRITES_ENABLED` paragraph, and the store boundary in the frontend
architecture section. Plus
`docs/adr/019-browser-is-store-of-record-for-anonymous-sentences.md` —
the Redis and server-session alternatives in §6.1 are exactly what an ADR
is for. **018 went to epic 012's provider-protocol narrowing**, so this
took 019.

---

## 10. Open Questions

None outstanding. The three this doc opened were answered before the
build started, and each changed the design rather than confirming it:

| question | answer | what it changed |
|---|---|---|
| An explicit "stored on this device" affordance? | **Yes**, permanent and non-dismissible | §6.5; a component and a notice slot in phase 3 |
| Purge folders as well as sentences? | **Yes**, both tables | §3.2, and the rule that any action dropping local sentences must warn first (§6.4) |
| Per-folder key granularity? | **Yes** | §3.1 rewritten; fan-out read, ordered two-key relocate, orphan keys (§7.6) |

The second answer had the longest reach. Generalising "warn before a
purge" from the production tables to the browser is what turned the
version guard from `return []` into quarantine-and-notify, and what
found the missing confirmation on sentence delete
(`SentenceListItem.jsx:143`) — a control that was safe against a server
table and is not safe against the only copy.

---

## 11. What Actually Shipped, and Where It Differed

The plan above is kept as written. Five things came out differently, and
the differences are the useful part.

**A phase 0 appeared.** `ApiError` and `RateLimitError` were declared in
`api.js` alongside `API_BASE_URL` and the fetch wrapper, so the local
store had to import the whole HTTP client to reach two class
declarations it shares nothing else with. They moved to `src/errors.js`
(#136), with `api.js` re-exporting them so no caller changed. **§4's file
table above is therefore wrong where it says `api.js` is unchanged.** The
extraction also unblocked verification: it is what let the store be
exercised outside a browser at all.

**Verification went headless first, and a browser pass nearly lied.**
`preview_start` roots itself at the repository root rather than a
worktree, so a preview server started from the worktree serves a
*different branch's* files. It did, and the page looked like a pass —
sentences rendering happily — until the served `App.jsx` was diffed
against the one on disk. The store was covered instead by 48 assertions
against a `localStorage` shim. The real browser pass happened later from
the main checkout, once phases 0–3 were on `main`, and the decisive check
was the **network tab showing zero requests to `/api/v1/sentences`** —
exactly what the false pass had shown a dozen of.

**A wrong assertion found a real subtlety.**
`getSentences({ folderId: null })` returns *every* sentence, not the
uncategorized ones — `buildSentenceListQuery` drops a falsy `folderId`
and the route filters only when `folder_id is not None`. The store
matched the server; the test did not. Neither store can be asked for
uncategorized alone, and nothing needs to. Now commented in the code.

**Introspecting mounted routes needs the OpenAPI schema.** `app.routes`
keeps included routers wrapped as `_IncludedRouter` on this FastAPI
version, so it lists only what `main.py` declares directly — the first
gate check reported that generation and all three content lines had
vanished too. `app.openapi()["paths"]` is both correct and closer to the
point, since keeping endpoints out of the schema is what the gate is for.

**The purge runbook's own command was wrong when first written.** It
documented `psql -f`, which runs the file and exits — and an open
transaction at session close is rolled back. It would have printed the
before-counts, printed after-counts of zero, and purged nothing, while
looking like it had worked. The commented-out `COMMIT` is only a safety
property if there is a prompt left to type it at. Corrected to the
interactive `\i` flow before anything was run.
