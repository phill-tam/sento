# 019 — The browser is the store of record for anonymous saved sentences

**Status:** Accepted
**Epic:** [013 — Local Sentence Storage](../epics/013-local-sentence-storage.md) ([#128](https://github.com/phill-tam/sento/issues/128))
**Related:** [011 — No auth, feature-flag gated only](011-no-auth-feature-flag-gated-only.md), [012 — Feature flags removed, admin write gate](012-feature-flags-removed-admin-write-gate.md), [007 — Decoupled from sentence generator item](007-decoupled-from-sentence-generator-item.md), [018 — AI provider protocol narrowed to complete()](018-ai-provider-protocol-narrowed-to-complete.md)

## Context

`generated_sentences` and `sentence_folders` had no owner column, and the
endpoints that wrote them had no authentication in front of them — there
is no `User` model in this project (ADR 011). Every saved sentence in
production therefore belonged to nobody in particular: two people using
the deployed frontend saw each other's sentences, and could relocate and
delete each other's rows.

The eventual answer is authentication, and the tables are being
**reserved** for it — a row should mean "this signed-in person kept this
sentence." Auth is its own epic. The question this ADR answers is where
an anonymous user's saved sentences live in the meantime, given the app
must keep working with no accounts and no environment configuration,
which is the posture ADR 012 left it in.

## Decision

**Saved sentences and folders live in the user's own browser
(`localStorage`). Generation stays on the server. The production
persistence endpoints are unmounted, and the rows that were in them are
purged.**

The data model already drew this line: candidates from a generation round
are ephemeral frontend state and only a Save persists anything (see the
`GeneratedSentence` class docstring). The epic relocated Save and left
the generator alone — generation needs a provider API key and cannot move
client-side.

Consequences the implementation is built around:

- **`src/sentenceStore.js` is the boundary**, mirroring the backend's
  `get_provider()` — one module that *would* branch. It does not branch
  yet, and deliberately so: with no auth there is no reachable remote
  arm, and a branch whose second arm no caller can reach is untested by
  construction. `api.js` keeps its now-unused copies of the eight
  functions for the auth epic.
- **Records keep the server's field names.** That is what leaves
  `SentenceListItem`, `SentenceFolderTree` and `useQuiz`'s sentence
  branch untouched, and what makes the login-time import a straight POST
  of the stored blob rather than a translation layer.
- **The folder-not-empty 409 now exists in two places** — the local store
  and `routes/sentence_folders.py`. Accepted: a shared rule module
  spanning Postgres and `JSON.parse` costs more than the rule. The
  server copy is not dead code; it is the invariant's backstop for when
  the routes are mounted again.

## Alternatives rejected

**Redis, holding anonymous sentences server-side.** This was the original
sketch and it does not fit. Redis is a server-side shared store; "each
user keeps their own sentences" is a client-side property. It would move
the exact problem from Postgres to Redis — still our infrastructure,
still unattributed, still one shared pile — while adding a service to the
deploy. There is also no cache to add: the records never leave the
machine that wrote them, so nothing exists for a server-side cache to sit
in front of.

Redis has real work in this codebase — rate-limiting
`POST /sentences/generate` and `POST /pair-writing/grade`, which share
one provider key and one quota (ADR 018), and caching the seeded content
lists the app refetches on every mount — but neither is this problem, and
on a single web process a Postgres counter row does the first with no new
infrastructure.

**A server-side anonymous session id, with a TTL.** Reads as a middle
path and is worse than both ends: still unattributed user data on our
infrastructure, still a new service, and it makes data loss a *scheduled*
event rather than a user action. The session id in local storage is doing
the job local storage would have done directly, with a network hop and an
eviction policy attached.

**Leaving the endpoints mounted and simply not calling them.** Our client
not calling an endpoint reserves nothing. They stay reachable by anyone,
which is the condition the epic exists to end.

**A migration to purge the rows.** A revision containing
`DELETE FROM generated_sentences` runs wherever `alembic upgrade head`
runs, including every developer's local database. The epic deletes
production rows and leaves local data alone, and a revision cannot
express that distinction. The purge is a manual, documented, run-once
script (`backend/scripts/purge_production_sentences.md`).

## Consequences

**Accepted:**

- Anonymous multi-device does not merge. Two browsers are two piles until
  each one logs in, and a user who never logs in never gets cross-device.
- Clearing site data destroys saved sentences. Hence the permanent,
  non-dismissible note in the generator: the failure it prevents is
  delayed by weeks, so a dismissible banner would be dismissed long
  before it mattered.
- The 409/404 rules live in two implementations that must not drift.

**Required by this decision, and easy to get wrong:**

- **Unreadable data is quarantined, never discarded.** The obvious reader
  for a versioned envelope, `if (v !== 1) return []`, destroys the user's
  entire library at exactly the moment something has already gone wrong.
  The key is renamed to `…:quarantine:{timestamp}` instead.
- **Storage failure is surfaced, not swallowed.** Every preference in
  this app try/catches `localStorage` into silence, which is right for a
  muted-volume flag and wrong for the only copy of a user's data. Reads
  degrade to empty; writes throw.
- **Destructive actions confirm.** Deleting a saved sentence had no
  confirmation while the server was the store — correct then, wrong the
  moment the browser holds the only copy.

## When auth arrives

The import is **one-shot on transition**, not sync: a browser going
anonymous → authenticated with a non-empty local pile ships it once and
switches to the remote store. Once per *browser*, not per user — local
storage is not shared, so the laptop pile and the phone pile are disjoint
sets and the union is what the user expects. The "already imported" guard
therefore belongs on the client, never as a server-side per-user flag,
which would silently discard the second device.

Three consequences that decision accepts, recorded so they are not
rediscovered: logging out shows an empty app and must say so rather than
restoring the archived copy (that would diverge and re-import); a lost
response duplicates the library unless the client sends an `import_id`
the server treats as idempotent; and every local id dies at import, so
state must be reloaded wholesale rather than patched — including
`activeSentenceFolderId`, which will otherwise point at a folder that no
longer exists.

The local tier **stays** as the anonymous tier after auth ships. It will
already be built, and it matches the app's no-configuration posture.
