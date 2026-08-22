# Epic 016 — AI Quota: Per-Device Budgets for the Two AI Endpoints

Both AI endpoints spent real provider quota per call with nothing in
front of them. This epic puts a daily budget on each, per device and
globally, on a counter that is deliberately generic enough for a third
feature to adopt.

**A fairness mechanism, not a security boundary** — the same distinction
ADR 011 draws for the admin write gate, and the sentence the rest of this
epic follows from. Identity is epic 015's client-generated `deviceId`,
free to mint and free to discard, so a per-device budget stops an
enthusiastic learner and stops nobody deliberate. See ADR 022 for the
full reasoning; this doc covers architecture and what shipped.

Third of three related pieces of work, split in #155:

| epic | what | needs a server? |
|---|---|---|
| 014 (shipped) | run history in the browser, Progress view | no |
| 015 (shipped) | `sento:deviceId`, `sento:displayName`, `POST`/`GET /leaderboard` | yes |
| **016 (this)** | per-device and global budgets on the two AI endpoints | yes |

**Status:** shipped. **Docs/ADRs:** [ADR 022](../adr/022-ai-quota-fairness-not-security.md). **Flags:** none — the four budget settings are tuning knobs, not gates; see §6.5. **Issue:** [#170](https://github.com/phill-tam/sento/issues/170).

---

## 1. Problem Statement

`POST /sentences/generate` (epic 005) and `POST /pair-writing/grade`
(epic 012) are both unauthenticated, both unmetered, and both spend
provider quota per call. They draw on the *same* key per environment via
`get_provider()`, so the two features share one budget with no accounting
between them. ADR 018 recorded this as a knowingly accepted gap —
widened, not created, when grading became the second caller.

The gap has two shapes, and conflating them produces the wrong mechanism:

- **Cost.** Nothing bounds what the project spends in a day.
- **Denial.** One caller consuming the budget locks everyone else out,
  even when the total spend was affordable.

A global cap answers the first. Only a per-caller limit answers the
second — and "per caller" is exactly what a project with no auth cannot
truly express, which is why the honest framing of what this buys had to
be settled before any code was written.

## 2. Architecture Overview

```
api.js (generateSentences, gradePairAnswers)
        │  X-Device-Id: <sento:deviceId>
        ▼
api/deps.py  device_id_header()          ← transport: parse, or None
        │
        ▼
routes/{sentences,pair_writing}.py
        │  1. resolve_source_items()     ← 404s here cost nothing
        │  2. charge(...)                ← reserve, commit
        │  3. provider call
        │  4. refund on provider-429 only
        ▼
services/ai_quota_service.py             ← policy: keys, limits, messages
        │
        ▼
services/usage_counter.py                ← mechanism: atomic count under a key
        │
        ▼
usage_counters (key, window_start, count)
```

The whole design is one line drawn twice: **transport does not know about
policy, and policy does not know about mechanism.**

### 2.1 The counter counts; it decides nothing

`usage_counter.py` takes a key, a limit and a window, and answers whether
one more occurrence fits. It never learns what an endpoint is, what a
device is, or what a fair budget looks like. The test for whether
something belongs in it is simple: if it names a device, an endpoint or a
budget, it is policy.

Generalising from a single caller is the mistake ADR 018 documents.
This is not that case — there were **three concrete callers on day one**
(a device budget and a global cap, across two endpoints), all identical
mechanics under different keys. The increment was going to be written
three times either way.

That also answers the question ADR 021 explicitly deferred here: a
future `POST /leaderboard` limiter adopts this helper unchanged, because
no policy ever entered it.

### 2.2 The increment is one statement, and that is the point

```sql
INSERT INTO usage_counters (key, window_start, count) VALUES (..., 1)
ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
  WHERE usage_counters.count < :limit
RETURNING count
```

The naive shape — SELECT the count, compare it to the limit, UPDATE — has
a race in the gap between read and write: two simultaneous requests both
read 9, both write 10, and one call is served free. That window cannot be
closed in Python without a lock this project has nowhere to put.

The `WHERE` on the conflict branch is what makes the check and the
increment inseparable: Postgres re-reads the existing row and applies the
update only if it is still under the limit. A refused call updates no row
and returns nothing, so **the count never climbs past the limit and never
needs walking back** — which is what keeps `refund()` unambiguous.

One consequence needs an explicit guard: the conflict branch only runs on
collision, so a zero limit would let the *first* call of a window insert
`count = 1` and be allowed. `check_and_increment` answers `limit <= 0`
before the statement rather than by it.

### 2.3 The charge sits in the route body, not a dependency

Both routes call `resolve_source_items` first, and it 404s on any unknown
`line_id` or missing row. A quota check attached to the route *decorator*
runs before the route body, so a request with bad refs — a client error
that never reaches a provider and costs nothing — would still burn a
slot.

So the header-reading `Depends()` stays where it is, and the *charge* is
an explicit call after resolution and before the provider call. This was
not in the original plan; it surfaced while reading `content_resolver.py`
during the pre-build gap check, and it is pinned by a test rather than
left as a comment.

### 2.4 Reserve up front, refund only where the failure is knowably free

Quota is spent by the **attempt**, not the success. A response that comes
back unparseable still generated tokens and still cost money, so counting
only successful calls hands unlimited billable attempts to anyone whose
input reliably fails. That is a hole through the mechanism, not an edge
case.

`AiProviderRateLimitExceeded` is the one knowably-free failure — the
provider refused before generating — and the one most likely to arrive in
bursts, so it refunds. `AiProviderFailedError` does not: it covers both
"answered with something unparseable" (billed) and "the SDK threw"
(perhaps not), and `complete() -> str` gives no way to tell them apart
(ADR 018).

The reservation commits immediately rather than being held in the
request's transaction. `ON CONFLICT DO UPDATE` takes a row lock, and
holding it across a multi-second provider call would serialise every
concurrent request behind whoever is currently generating.

### 2.5 Three causes, three sentences, no frontend change

`api.js`'s `request()` builds `RateLimitError` from `body.detail.detail`,
and both hooks render `err.message` verbatim — so the backend already
controlled the user-visible sentence end to end before this epic started.
Reusing the existing `rate_limit_exceeded` code meant `request()`,
`errors.js`, both hooks and both notice components needed **no changes at
all**.

| Cause | What the learner is told |
|---|---|
| Device budget | "You've used today's 20 sentence generations. Your budget resets at 00:00 UTC." |
| Global cap | "Sento's shared daily AI budget is used up. Please try again tomorrow." |
| Provider 429 | (unchanged — the provider's own message) |

The middle row is why the split was worth doing: the previous single
message would tell a learner who generated twice today that *they* hit a
limit. Confusing, and from their side false. `global_exhausted_message`
deliberately never mentions the caller's own usage, and a test asserts
the word "today's" is absent from it.

Messages are built from the limits rather than written out, so a `.env`
change cannot leave a stale number in a sentence a learner reads.

## 3. Data Model

### 3.1 `UsageCounter`

```python
class UsageCounter(Base):
    __tablename__ = "usage_counters"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    window_start: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

- **`key` is opaque here on purpose.** Not an enum, not a foreign key —
  constraining it would put the policy layer's vocabulary into the
  mechanism. `ai_quota_service` builds `generate:device:<uuid>`,
  `generate:global`, `grade:device:<uuid>`, `grade:global`.
- **The composite primary key is the mechanism, not an index.** It is the
  conflict target that makes the increment atomic. A surrogate id with a
  unique constraint alongside would behave identically and add a column
  nothing selects by.
- **`window_start` is a `date`, not a timestamp.** Windows are UTC
  calendar days, so the value is the window's identity rather than the
  moment something happened in it.
- **No timestamps.** `window_start` is the only time a tally has,
  retention included, and a counter is not an entity with a history.

Migration: `e106fe5d665b_add_usage_counters_table.py`.

### 3.2 Why a UTC calendar day and not a rolling window

A rolling 24-hour window closes the boundary burst — twenty calls at
23:59 and twenty more at 00:01. That is real, and irrelevant here:
anyone willing to wait six hours for a second budget is far more willing
to clear `localStorage` and have one instantly. Closing that plank while
the gate stands open buys nothing, and costs a row per *call* instead of
per day, a range scan instead of a primary-key hit, and a retention job.

Local-timezone windows were rejected separately: a client-supplied UTC
offset is forgeable in the same trivial way, which makes the boundary
burst *worse* while adding a field.

## 4. API Surface

No new endpoints. Two existing ones gained a header and a failure mode.

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/v1/sentences/generate` | Reads `X-Device-Id`; may 429 with a budget message |
| `POST` | `/api/v1/pair-writing/grade` | Same |

Neither request schema gained a field, and neither service learned that
quota exists — `generate_sentences` and `grade_pair_answers` stay
ignorant of who is paying (ADR 018).

**`X-Device-Id` is optional, and its absence is not an error.** A missing
or malformed value maps onto one shared `device:anonymous` budget, which
makes omitting the header the *worst* available option — one device-sized
budget split between everyone who tries it — rather than a bypass.
Enforcement does not depend on clients cooperating.

Anything that is not a UUID is treated as absent. The value becomes part
of a counter key, so accepting arbitrary text would mean unlimited
budgets *and* unbounded rows in `usage_counters`. That is key hygiene,
not a security check — a well-formed random UUID is just as free to mint.
The value is normalised through `str(UUID(...))`, so one device sending
upper- and lower-case forms of its id shares a budget instead of holding
two.

## 5. Frontend Components

None. The entire frontend change is two call sites:

| File | Change |
|---|---|
| `src/api.js` | `generateSentences` and `gradePairAnswers` send `X-Device-Id` from `identityStore.getDeviceId()` |

**Sent by those two calls only, never from `request()`.** The raw device
id functions as a bearer credential for the leaderboard (ADR 021) — it is
why the board publishes a hash instead — so it goes where it does
something rather than onto every request the app makes.

**A header here, a body field in `submitLeaderboardRuns`, and the
inconsistency is the point.** There the device id is domain data: the key
of the row being written. Here the endpoint does not care who asked, so
it is metering metadata riding along. A test pins both halves, so a
future "make it consistent" change has to argue with something.

## 6. Decisions

### 6.1 Calls as the unit, per endpoint, not weighted credits

Token metering is ruled out by the codebase rather than by preference:
ADR 018 narrowed the protocol to `complete(*, prompt, max_tokens) -> str`,
so there is no usage metadata to count.

Given calls, a single weighted "credit" budget was rejected. A grading
call costs roughly three times a generation (`max_tokens` 3072 against
1024), but pricing that into a shared budget couples the two features —
heavy generator use in the morning would refuse a Word Pairs quiz in the
evening, for reasons a learner cannot see. "7 credits left" is also a
unit nobody has a model for. Separate budgets price the asymmetry into
the *numbers*.

### 6.2 Four independent dials, not a percentage of one budget

A per-device cap expressed as a share of the global one means N devices
at full budget exhaust everything and the N+1th honest learner is
refused — which is the denial the per-device cap exists to prevent.

### 6.3 Device counter first, and a global rejection refunds it

Device first, so a learner with both exhausted gets the message they can
act on. That ordering creates a trap: the device counter is already
incremented when the global check fails, and the request is not being
served. A global rejection therefore hands the device occurrence back,
using the same refund primitive as the provider-429 path.

### 6.4 No `scope` discriminator on the 429 body

Tempting — one field, might be useful — and an abstraction with no caller
until a UI wants to branch on cause. The three causes differ in *words*,
which already flow through `err.message`. Add it when something needs to
render them differently.

### 6.5 The budget settings are tuning knobs, not gates

`settings.py` has twice meant access control in this project
(`admin_writes_enabled`, `sentence_persistence_enabled`), so it is worth
saying plainly: these four are not that. The feature is unconditionally
on, and setting one to `0` disables an endpoint rather than configuring
it. They are in the `DEFAULT_GEMINI_MODEL` mould — changing a budget is a
`.env` edit, never a code change.

## 7. Build Plan

| Phase | Branch | PR |
|---|---|---|
| 0 | `chore/quota-prep` | [#171](https://github.com/phill-tam/sento/pull/171) — api.js header merge, AI-provider and content test fixtures |
| 1 | `feat/usage-counter` | [#172](https://github.com/phill-tam/sento/pull/172) — ADR 022 and the generic usage counter |
| 2 | `feat/ai-quota` | [#173](https://github.com/phill-tam/sento/pull/173) — per-device and global budgets on both endpoints |
| 3 | `feat/device-id-header` | [#174](https://github.com/phill-tam/sento/pull/174) — send X-Device-Id on the two metered calls |
| 4 | `docs/epic-016` | this document |

### 7.1 Deploying this needs a manual migration

Merging the phases is not enough. Nothing in this project runs
migrations on deploy — CI applies them only to its own ephemeral
Postgres — so `e106fe5d665b_add_usage_counters_table` reaches production
only when someone runs `alembic upgrade head` by hand against the
direct, non-pooler connection.

Until that happens, **both AI endpoints 500 on every call**: `charge()`
runs after ref resolution and before the provider call, so it fails on
the missing table and generation breaks for everyone. The deploy looks
healthy, because every other route still answers.

This is not hypothetical for this epic — it is exactly how epic 015
broke in production, discovered during a smoke test on the Progress page
while 016 was still in review. See the README's Deployment section,
which now names the direction the additive-and-nullable convention does
*not* protect: newer code against an older schema.

## 8. What Actually Shipped, and Where It Differed

### 8.1 Phase 0 grew from one item to three, and one of them was a real bug

The planned phase 0 was a single wrapper fix. The pre-build gap check
found two more, both of which would have blocked phase 2's first test:

- **Nothing stubbed the AI provider through the app's request path.** The
  only existing stub was local to `test_answer_grading_service.py`,
  patched one module, and could only return a payload — phase 2 needed
  one that *raises*, for the two refund rules. Lifted into `conftest.py`,
  patching both service modules, because both do
  `from ... import get_provider` and bind it at import time; rebinding
  the source module would leave both callers holding the original.
- **No backend test had ever created a content row.** Epic 015 needed
  none. A quota test posting invented refs 404s at resolution, before
  reaching anything this epic built.

### 8.2 A pre-existing test-isolation bug, found by running the whole suite

Five leaderboard tests failed on any developer machine the app had been
used on, while passing in CI. `db_session` rolls back every write, but
rolling back writes does not isolate *reads*: `get_leaderboard` is
`SUM(score) GROUP BY device_id` over the whole table, so a row committed
by using the app appeared in a test's results. CI never saw it, because
its Postgres is created empty per run.

This epic would have hit it harder — the global cap reads a counter under
a *fixed* key, so one local generate call would poison the test.

Fixed with a separate `TEST_DATABASE_URL`, falling back to `DATABASE_URL`
so CI needed no new variable. Two alternatives were rejected: scoping
each assertion to its own ids fixes five tests and leaves the trap armed
for the next aggregate test; truncating in the fixture works (TRUNCATE is
transactional) but "the suite empties your database and trusts the
rollback" is one fixture bug away from being true in the bad way.

### 8.3 Phase 0's coverage debt was paid in phase 3, deliberately

The `request()` header merge shipped **unasserted**, and the phase 0
commit said so. `request()` is module-private and nothing passed a header
yet; exporting it purely to test would have handed components a way to
make inline API calls, which is the one rule `api.js` exists to enforce.

Its first real caller arrived in phase 3, so the assertion arrived there
too. Reverting the merge now fails two tests with `Content-Type` missing
entirely — the 422 the phase 0 commit predicted, demonstrated rather than
argued.

### 8.4 Every arrangement claim was mutation-checked

Several properties here are not visible in a diff — they are *orderings*.
Each was verified by breaking it and confirming exactly one test caught
it:

| Mutation | Caught by |
|---|---|
| `check_and_increment` as read-compare-write | both concurrency tests (all ten single-threaded tests still passed) |
| Charge moved above `resolve_source_items` | `test_a_404_costs_nothing_and_never_reaches_the_provider` |
| Global rejection stops refunding | `test_refuses_without_blaming_the_learner_and_refunds_their_slot` |
| Provider-429 stops refunding | `test_a_provider_rate_limit_gives_the_slot_back` |
| `request()` reverted to the old spread | two of phase 3's header tests |

The first is the one worth remembering: every ordinary test passed
happily against the broken implementation, so asserting the SQL by
inspection would have proved nothing.

### 8.5 Phase 3 branched from `main`, not from phase 2

Requested mid-build, and it turned out to be the better sequence. A
header sent to a backend that ignores it is inert, so phase 3 is harmless
alone — whereas phase 2 alone means no `X-Device-Id` arrives and every
caller lands in the shared anonymous bucket, i.e. one 20-call budget for
all users. Landing phase 3 first removes that window.

## 9. Planned Upgrades

- **The leaderboard adopting the counter.** ADR 021 deferred this to
  whatever 016 built. `POST /leaderboard` protects table growth rather
  than paid quota, so it wants a different key, window and limit — but
  the same mechanism. Worth doing now that there are two real callers.
- **Row retention.** Rows accumulate at one per key per day and are never
  deleted — a few dozen a day at the global cap, so nothing needs doing
  yet, but it grows without bound. A periodic
  `DELETE WHERE window_start < current_date - 30` belongs as a hand-run
  script, following `backend/scripts/purge_production_sentences.md`,
  since a migration would run against local databases too.
- **A warning threshold on the global cap**, so exhaustion is not first
  discovered by a learner seeing "try again tomorrow". A log line at 80%
  is cheap; anything user-facing was judged out of scope.
- **Per-IP limiting as a second layer.** Not client-asserted, so strictly
  harder to evade — but CGNAT means a whole mobile carrier can share one
  address, so it blocks strangers for each other's usage. Available if
  the device budget ever proves insufficient.
- **The budgets themselves.** Chosen so honest use never reaches them,
  not measured. The first real signal will be someone hitting one.

## 10. Open Questions

- **Does an exhausted device budget deserve a pre-emptive UI state** —
  the Generate button disabled with a count, rather than a 429 after the
  click? That needs a `GET` for remaining budget, which is a second
  endpoint and a real scope increase. Flagged so it is not silently
  assumed either way.
- **Does the global cap need to distinguish "exhausted by many users"
  from "exhausted by one"?** Today it cannot, and the per-device budget
  is the only thing making the second case unlikely. If it ever matters,
  the counter rows already carry enough to answer it.
