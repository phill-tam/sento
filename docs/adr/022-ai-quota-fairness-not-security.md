# 022 — AI quota is a fairness mechanism, metered per attempt, on a generic counter

**Status:** Accepted
**Epic:** 016 — AI Quota ([#170](https://github.com/phill-tam/sento/issues/170))
**Related:** [011 — No auth; feature flag is not a security boundary](011-no-auth-feature-flag-gated-only.md), [018 — The AI provider protocol narrows to `complete()`](018-ai-provider-protocol-narrowed-to-complete.md), [021 — Anonymous leaderboard trust model](021-anonymous-leaderboard-trust-model.md)

## Context

`POST /sentences/generate` (epic 005) and `POST /pair-writing/grade`
(epic 012) are both unauthenticated, both unmetered, and both spend real
provider quota per call. They draw on the *same* key per environment
through `get_provider()`, so the two features share one budget with no
accounting between them. The provider's own rate limit is the only
backstop, which ADR 018 recorded as a knowingly accepted gap — widened
rather than created when grading became the second caller.

The gap has two distinct shapes, and conflating them produces the wrong
mechanism:

1. **Cost.** Nothing bounds what the project spends in a day.
2. **Denial.** One caller consuming the whole budget locks everyone else
   out, even if the total spend was affordable.

ADR 021 established that identity in this project is a client-generated
`deviceId`, free to mint and free to discard. Any per-user limit
inherits that property.

## Decision

### This is a fairness mechanism, not a security boundary

The same distinction ADR 011 draws for the admin write gate, and it
governs everything below. A per-device budget stops **accidental**
exhaustion — an enthusiastic learner clicking generate forty times in an
evening, who is not trying to evade anything and for whom the limit
works perfectly. It stops nothing deliberate: clearing site data, opening
a private window, or sending a different `X-Device-Id` all produce a
fresh budget instantly.

What bounds the *bill* is the global cap. The per-device budget exists so
one caller cannot consume that cap and deny everyone else. Neither is
protection against an adversary, and nothing built later may assume
otherwise.

Every intermediate defence was considered and rejected as theatre:
signing requests needs a secret that ships to the browser in readable
JavaScript; validating a call's legitimacy server-side needs server-side
knowledge of a quiz that runs entirely in the client; and trusting
`deviceId` harder does not make it less client-generated. These are the
same dead ends ADR 021 documents, for the same root reason — there is no
auth.

### A generic counter, with policy kept out of it

`services/usage_counter.py` owns one thing: counting occurrences under a
string key inside a window, atomically. It never learns what an endpoint
is, what a device is, or what a fair budget looks like.
`services/ai_quota_service.py` owns all of that.

Generalising from a single caller is the mistake ADR 018 documents —
`SentenceProvider.generate()` was shaped around one feature and torn down
when a second arrived. This is not that case: there are **three concrete
callers on day one** (a device budget and a global cap, across two
endpoints), all identical mechanics under different keys. The increment
is written three times either way; the only question is whether it is
written once or three times.

The split also holds under pressure, which is what makes it a real
boundary rather than a guessed one. Nothing feature-specific lives in the
counter, so it cannot drift into a god-object, and ADR 021's deferred
question — whether `POST /leaderboard` adopts the same helper — is
answerable later without changing it.

**The increment must be one statement.** `INSERT ... ON CONFLICT DO
UPDATE SET count = count + 1 RETURNING count`, never a read followed by a
write: two simultaneous requests would both read 9, both write 10, and
the budget would leak. This is the whole reason the counter is a database
helper rather than application logic, and it is asserted by a test that
runs concurrent increments rather than trusting the SQL by inspection.

### Metered in calls, per endpoint, with the numbers in settings

Token metering is ruled out by the codebase rather than by preference:
ADR 018 narrowed the protocol to `complete(*, prompt, max_tokens) -> str`,
so there is no usage metadata to count without widening it back into the
provider-metadata shape that decision removed.

Given calls as the unit, a single weighted "credit" budget was rejected —
a grading call costs roughly three times a generation (`max_tokens` 3072
against 1024), but pricing that into a shared budget couples the two
features, so heavy generator use in the morning refuses a Word Pairs quiz
in the evening for reasons the learner cannot see. "7 credits left" is
also a unit nobody has a model for. Separate per-endpoint budgets price
the asymmetry into the *numbers* instead of into a mechanism.

Limits live in `settings.py` with named module-level defaults, in the
`DEFAULT_GEMINI_MODEL` mould: changing a budget is a `.env` edit, never a
code change. User-facing messages are built from the setting, so a number
cannot go stale in a string.

**A missing or malformed `X-Device-Id` shares one bucket**
(`device:anonymous`) rather than being rejected or waved through.
Omitting the header then becomes the *worst* available option — one
device-sized budget shared across everyone who tries it — instead of a
bypass. Enforcement does not depend on clients cooperating.

### A UTC calendar day, not a rolling window

A rolling 24-hour window closes the boundary burst — twenty calls at
23:59 and twenty more at 00:01. Here that is nowhere near the weakest
link: anyone willing to wait six hours for a second budget is far more
willing to clear `localStorage` and have one instantly. Closing that
plank while the gate stands open buys nothing, and costs a row per call
instead of per day, a range scan instead of a primary-key hit, and a
retention job.

Local-timezone windows were rejected separately: a client-supplied UTC
offset is forgeable in exactly the same trivial way, which makes the
boundary burst *worse* while adding a field.

### Reserve up front; refund only where the failure is knowably free

Quota is spent by the **attempt**, not the success. A response that comes
back unparseable still generated tokens and still cost money, so counting
only successful calls hands unlimited billable attempts to anyone whose
input reliably fails. That is not a fairness edge case; it is a hole
through the mechanism.

A blanket refund over-corrects for the same reason inverted:
`AiProviderFailedError` covers both "answered with something unparseable"
(tokens spent) and "the SDK threw" (perhaps not), and `complete() -> str`
gives no way to tell them apart.

`AiProviderRateLimitExceeded` — the provider's *own* 429 — is the one
knowably-free failure, and the one most likely to arrive in bursts. It is
refunded. It cannot be abused, since a provider-429 storm produces no
output to extract.

Two consequences follow from the same refund primitive:

- **Ordering.** Device counter first (over limit → 429, global
  untouched), then global (over limit → refund the device increment, 429
  with the global message). Device first so the more actionable message
  wins when both are exhausted.
- **Placement.** Both routes resolve refs via `resolve_source_items`
  before anything else, and that 404s on unknown refs. A check attached
  to the route *decorator* would run first and charge for a request that
  never reached the provider, so the charge sits in the route body, after
  resolution and before the provider call. The header-reading `Depends()`
  stays where it is.

**The reservation commits immediately** rather than being held in the
request's transaction. `ON CONFLICT DO UPDATE` takes a row lock, and
holding it across a multi-second provider call would serialise every
concurrent request behind whoever is currently generating.

### One 429 shape, three messages

`api.js`'s `request()` builds `RateLimitError` from `body.detail.detail`,
and both hooks render `err.message` verbatim — so the backend already
controls the user-visible sentence end to end. Three causes need
different *words*, not different code paths:

| Cause | What the learner is told |
|---|---|
| Device budget | "You've used today's N generations. Your budget resets at 00:00 UTC." |
| Global cap | "Sento's shared daily AI budget is used up. Try again tomorrow." |
| Provider 429 | "The AI service is busy right now. Try again in a moment." |

The second row is the one that matters: the existing single message would
tell a learner who generated twice today that *they* hit a limit —
confusing, and from their side false.

Reusing the existing `rate_limit_exceeded` code means `request()`,
`errors.js`, both hooks and both notice components need no changes at
all. No `scope` discriminator field is added; that is an abstraction with
no caller until a UI wants to branch on cause.

## Consequences

**Positive:**

- Closes ADR 018's accepted gap without inventing an auth scheme that
  would be discarded when real auth lands.
- The two failure modes a learner can actually hit are now
  distinguishable in words, including the one that is not their fault.
- The counter is reusable by `POST /leaderboard` (ADR 021's deferred
  question) without modification, because policy never entered it.
- Budgets are tunable by `.env` edit, so the first real usage signal does
  not require a code change.

**Negative:**

- Anyone who wants past the per-device budget gets past it in one click.
  This is stated rather than mitigated; see the fairness/security split
  above.
- Counter rows accumulate at one per key per day and are never deleted.
  A few dozen a day at the global cap, so nothing needs doing now, but it
  grows without bound — retention is a hand-run script, following
  `backend/scripts/purge_production_sentences.md`, since a migration
  would run against local databases too.
- An honest learner whose call fails with `AiProviderFailedError` loses
  one of their budget. Bounded and rare, and the alternative reopens the
  attempt-metering hole.
- The device budget and the global cap can disagree about fairness at the
  boundary: a learner who is under their own budget can still be refused
  because the global cap is exhausted by others. That is the intended
  behaviour of a shared resource, but it is a state the UI cannot predict
  before the click.

## Alternatives Considered

**Per-endpoint kill switches, or a `FEATURE_PAIR_WRITING` flag.** Already
rejected by ADR 018 — gating a feature off is not metering it, and the
project removed per-epic flags in ADR 012.

**Rate limiting by IP instead of by device.** Not client-asserted, so
strictly harder to evade — but CGNAT means a whole mobile carrier can
share one address, so the failure mode is blocking strangers for each
other's usage. Rejected as a first layer; still available as a second one
if the device budget ever proves insufficient.

**Redis or a dedicated rate-limit service.** Rejected: a Postgres counter
row needs no new infrastructure, and this project runs a single web
process against a database it already has.

**In-memory counters.** Reset on every deploy and break the moment there
is more than one worker. Not viable even as a stopgap.
