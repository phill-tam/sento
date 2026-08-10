# 012 — Feature flags removed; content writes behind an admin gate

**Status:** Accepted
**Supersedes:** [005 — Feature flags named per-epic](005-feature-flags-per-epic-naming.md)
**Amends:** [011 — No auth, feature-flag gated only](011-no-auth-feature-flag-gated-only.md)

## Context

Every epic shipped behind a per-epic feature flag (ADR 005). With all
seven epics live, the flags had stopped doing the job they were added
for — nothing was mid-flight, and no flag had been flipped in anger for
some time. What they were still doing was costing us:

- `App.jsx` carried five flag reads and eight conditional branches for
  states that could no longer occur.
- `FEATURE_CONTENT_MANAGEMENT` had been hardcoded `false` on the
  frontend, ignoring its env var. The CMS was unreachable in every
  environment, which no env template or doc recorded.
- A fresh clone with no `.env` rendered `Sento — scaffold running` and
  nothing else, with no error explaining why.

The blocker was that `FEATURE_CONTENT_MANAGEMENT` gated a whole
resource router per content line, and each of those routers mixed
access levels:

```
GET   /kanji              <- Study fetches this on every page load
POST  /kanji/upload       <- unauthenticated write
PATCH /kanji/{id}/status  <- unauthenticated write
```

So the flag could not simply be deleted in either direction. Off, Study
has no data at all. On, the write endpoints are publicly callable —
there is no `User` model or auth anywhere in this project.

Worse, the two were already coupled in production: because Study needs
`GET /kanji`, any deployment rendering flashcards **must** have had
`FEATURE_CONTENT_MANAGEMENT=true`, and therefore had the write
endpoints exposed the whole time. The frontend's hardcoded `false` hid
the UI, not the API. ADR 011's protection was not actually holding.

## Decision

**All per-epic feature flags are removed.** `backend/app/config/feature_flags.py`
and `frontend/src/config/featureFlags.js` are both deleted. Study, Quiz,
the Sentence Generator and the global quiz pool are unconditionally on.

**Content routers are split by access level, not by resource.** Each of
`routes/{kanji,vocab,grammar}.py` now exposes two routers:

- `router` — the `GET` list endpoint. Always mounted.
- `admin_router` — `POST /upload` and `PATCH /{id}/status`. Mounted only
  when `ADMIN_WRITES_ENABLED` is set.

This keeps ADR 008's one-file-per-content-line structure; the split is
within each file, not a new generic handler.

**The remaining switch is access control, not a feature flag.**
`ADMIN_WRITES_ENABLED` (backend, `settings.py`) and
`VITE_ADMIN_WRITES_ENABLED` (frontend, `config/adminMode.js`) both
default to `false`. They are named for what they protect rather than for
an epic, and they are not expected to be removed — they stand in for the
authentication this project does not have.

The two are enforced independently. The frontend var only decides
whether the CMS UI is offered; setting it alone yields a page whose
requests 404.

## Consequences

- Study now works with **no** environment configuration, and without
  exposing any write endpoint. That combination was previously
  impossible.
- The default deployment posture is materially safer than before: six
  write endpoints that were reachable in production are now absent from
  the OpenAPI schema unless explicitly enabled.
- ADR 011's core warning stands, narrowed: it now attaches to
  `ADMIN_WRITES_ENABLED` rather than `FEATURE_CONTENT_MANAGEMENT`, and
  covers only the write endpoints rather than all nine routes.
- `POST /sentences/generate` is now unconditionally mounted and remains
  unauthenticated. It spends real AI provider quota per call, and the
  provider's own rate limit is the only backstop. This was a deliberate
  trade accepted when the flag was removed — an app-level rate limit or
  an auth model is the real fix, and neither exists yet.
- Adding a genuinely incomplete feature in future means either finishing
  it behind a branch, or reintroducing a single short-lived flag and
  deleting it on merge. ADR 005's per-epic naming convention no longer
  applies, since there are no per-epic flags.
