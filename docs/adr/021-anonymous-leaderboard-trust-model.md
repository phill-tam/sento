# 021 — Anonymous leaderboard trust model

**Status:** Accepted
**Epic:** 015 — Ranking ([#161](https://github.com/phill-tam/sento/issues/161))
**Related:** [011 — No auth, feature-flag gated only](011-no-auth-feature-flag-gated-only.md), [012 — Feature flags removed, admin write gate](012-feature-flags-removed-admin-write-gate.md), [019 — The browser is the store of record for anonymous saved sentences](019-browser-is-store-of-record-for-anonymous-sentences.md), [020 — Score history storage conventions](020-score-history-storage-conventions.md)

## Context

Epic 014 gave every learner a private run history. This epic makes a
slice of it comparable across learners, which needs somewhere shared to
live — the browser cannot be that place on its own, so this is the first
epic to add a real table and a write endpoint since 012.

That makes it a genuinely different problem from the one ADR 019 solved,
not an extension of it. 019 exists because an unattributed shared pile of
saved sentences was the *wrong* outcome — the fix was to get the data off
shared infrastructure entirely. A leaderboard's whole point is to be a
shared, comparable pile; there is no version of this feature that isn't
that. So this ADR cannot lean on 019's answer and has to make its own
case for why an intentionally shared, unauthenticated table is acceptable
here specifically, and what it may and may not be trusted to mean.

There is still no `User` model anywhere in this project (ADR 011), and
this epic does not add one. Identity is a client-generated `deviceId` —
self-asserted, unverifiable, and known to be so going in.

## Decision

### Ranks cumulative correct answers, computed server-side from submitted runs

Rewards consistent study over one lucky run, and is self-limiting against
short-run gaming without needing a minimum-run-length rule: a 1/1 run
contributes exactly 1.

The server never stores or increments a running total. `leaderboard_runs`
holds one row per submitted run, keyed on **the run's own id** —
`scoreStore.recordRun`'s existing `crypto.randomUUID()`, already stamped
on every local record before this epic exists. The client resubmits its
whole history (bounded by `scoreStore`'s own 200-run cap) on every sync;
the server **upserts by run id**. The board is `SUM(score) GROUP BY
device_id` over that table, recomputed on read.

This is the load-bearing choice in this ADR: it is what makes submission
**idempotent by construction**. A naive design — the server increments a
counter on every `POST` — is trivially inflated by replaying the same
request, and there is no auth to distinguish a retry from a deliberate
repeat. Keying on a client-generated id the server never invents or
increments sidesteps the question entirely: replaying a submission
re-upserts the same rows, changing nothing.

### Identity is two ordinary preference keys, not a shared record

`sento:deviceId` and `sento:displayName`, in `stores/identityStore.js`.
The original plan (see issue #155, and CLAUDE.md before this epic
corrects it) had these as one `sento:profile` record. That stopped
holding once epic 016's per-device AI quota was scoped — `deviceId`
gained a second, unrelated consumer and no longer has a single "read and
written together" lifecycle with `displayName`. See CLAUDE.md's
preference-key list for the full reasoning; this ADR just records that
the split happened and why.

### The board's discriminator is a derived hash, never a slice of `deviceId`

`deviceId` is the only thing that authorizes writing to a device's rows —
it functions as a bearer credential, self-asserted or not. Rendering
`Phil · 7a3c` where `7a3c` is literally the id's own prefix publishes part
of that credential to every viewer of the board. The discriminator must
be a one-way derivation (a short hash of the id), never a substring of
the id itself.

### Display names are labels, not identities — no uniqueness constraint

With no auth there is no ownership proof and therefore no recovery path.
A unique-name constraint would mean whoever's device first POSTs a name
owns it permanently, with no path back for the real person if their
`deviceId` is ever lost — which happens on an ordinary `localStorage`
clear, not just deliberate action. That converts a routine event into
permanent, unrecoverable loss of a name, in exchange for protection that
is free to defeat anyway (mint a second `deviceId`, claim the name
again). Collisions are disambiguated visually by the hash discriminator
above; a duplicate name is expected and harmless, the way two conference
attendees can both wear a tag that says "Phil."

The only enforcement is input hygiene, not identity protection: trim,
cap length, reject empty or whitespace-only. `identityStore.js`'s
`setDisplayName` does this and only this.

### The endpoint is unconditionally mounted — no settings flag

Both existing gates in `settings.py` (`admin_writes_enabled`,
`sentence_persistence_enabled`) are interim: access control standing in
for auth that doesn't exist yet, default off, meant to be flipped on only
by whoever is the sole reachable caller (ADR 011, ADR 012). `POST
/leaderboard` doesn't fit that shape — there is no state in which this
endpoint being reachable by the public is a mistake, because being
reachable by the public *is* the feature. Gating it off would not make
the feature safer to enable later; it would just mean the feature doesn't
exist. So it is mounted the same way `POST /sentences/generate` is:
unconditionally, in `api/v1/router.py`, alongside a comment explaining
why it differs from the two settings-gated routers beside it.

The request body is bounded the same way `pair_writing.py`'s grading
endpoint already is (`MAX_ANSWERS_PER_RUN`, `MAX_ANSWER_LENGTH`) — a
submission is capped at `scoreStore`'s own 200-run limit, so the endpoint
cannot be asked to upsert an arbitrarily large payload in one call.

## Accepted gaps

Six, all closed by the same future epic (auth), documented here rather
than left implicit — the same role ADR 011 plays for the admin-write
gate, so a future reader cannot reasonably assume a guarantee that was
never made:

1. **Clearing site data destroys identity and accumulated score,
   irrecoverably.** No ownership proof means no recovery path.
2. **Scores are client-computed and trivially forgeable** — a `curl` to
   the endpoint with a fabricated run, or editing `scoreStore`'s numbers
   in devtools before a real sync. The server never observes a quiz being
   taken; it only ever sees a JSON payload claiming one happened.
3. **Display names aren't unique; impersonation is possible.** Accepted
   directly above.
4. **The same person on two browsers or devices appears as two unrelated
   entries.** Nothing links them, and nothing can without an account.
5. **`deviceId` is a bearer credential in practice.** Anyone who learns
   one can submit runs as that device.
6. **Idempotency by run id stops replays, not a fabricated id.** A
   forged UUID submitted once is indistinguishable from a real run.

**The rule these six add up to: nothing built on top of this data may
treat it as true.** No badge, no "verified top scorer," no feature that
assumes a number on this board reflects what actually happened in a
quiz. This is the test for every future addition that touches leaderboard
data, not a one-time caveat.

## Alternatives rejected

**Signing submissions with an embedded secret.** The secret would have
to ship inside the frontend bundle to be usable at all, which makes it
public the moment it's deployed. Signing with a key the client also
holds authenticates nothing; it just adds a step an attacker replays
identically.

**Validating scores server-side.** Would require the server to observe
the quiz being taken, which it structurally cannot: the quiz runs
entirely in the browser, and there is no server-side session tracking
its progress. The only way to make this real is to move quiz execution
server-side, which is a different project.

**A unique-name constraint with a claim/reset flow.** Considered and
rejected in the display-name decision above — every reset mechanism
needs a way to prove the claimant is who they say they are, which is
exactly the auth this project doesn't have.

**Rate-limiting this endpoint the same way the AI endpoints will be
(epic 016).** Not adopted here as a shared mechanism. The two protect
different things — epic 016's limiter protects paid provider quota per
call; this endpoint protects table growth and payload size, already
bounded by the request-size cap above. A shared abstraction designed now,
with only one real caller, would repeat the mistake ADR 018 already
documents (`SentenceProvider.generate()` shaped around one feature and
torn down when a second arrived). If epic 016 ships a reusable Postgres
counter helper, this endpoint can adopt it then; it does not need to
invent one now.

## Consequences

**Positive:**

- Ships a real, working feature with no dependency on the auth epic —
  the same posture ADR 011 established for content management.
- Every gap is named before the feature exists rather than discovered
  after, and the six converge on one rule simple enough to apply to
  future features without re-deriving it.
- Idempotent-by-run-id submission means a flaky connection or a retried
  request cannot corrupt or inflate a score, independent of the trust
  questions above.

**Negative:**

- The board can be gamed by anyone motivated to open devtools or a
  terminal. Accepted as low-stakes for an N5 study app; revisit if that
  assumption stops holding.
- No cross-device identity. A learner who studies on a phone and a
  laptop appears as two entries until auth ships and can merge them.
- Display-name collisions are expected, not exceptional — the UI must
  render the hash discriminator by default, not as a rare disambiguation
  case, or the two identical-looking entries read as a bug.
