# 018 — The AI provider protocol narrows to `complete()`, and quota is now shared between two features

**Status:** Accepted
**Related:** [008 — Per-content-line route files](008-per-content-line-route-files.md), [012 — Feature flags removed, admin write gate](012-feature-flags-removed-admin-write-gate.md), [015 — Romaji computed except grammar](015-romaji-computed-except-grammar.md)

## Context

`SentenceProvider.generate(*, prompt: str, count: int) -> list[GeneratedSentenceCandidate]`
was the entire provider abstraction behind sentence generation: one method,
shaped around one feature's response type, implemented by
`GeminiSentenceProvider` and `ClaudeSentenceProvider` inside
`sentence_generation_service.py`.

Epic 012's Word Pairs mode needed the same two providers to grade a
learner's written English against a rubric and return verdicts, not
sentence candidates. `generate()` could not serve that call — its return
type is wrong, and its name says what it does. The two paths available
were narrowing the existing method into something feature-agnostic, or
adding a second method (or a second protocol) shaped around grading.

A second method on the same protocol was rejected first, before a second
protocol was even considered: `generate_sentences_thing()` and
`grade_thing()` living side by side does not stop a third feature from
adding a third method, and every new method is a new place `get_provider()`
could in principle be bypassed. The actual property worth protecting is
narrower and already named in the codebase's own architecture notes:
`get_provider()` is **the only place that branches on
`settings.environment`**. Two response-shaped methods on one protocol do
not threaten that directly, but they invite the next feature to reach for
a second switch instead of asking why the existing one wasn't reusable —
which is exactly what happened here, and exactly what this decision heads
off for the feature after this one.

## Decision

### The protocol narrows to prompt-in, text-out

```python
class AiProvider(Protocol):
    def complete(self, *, prompt: str, max_tokens: int = 1024) -> str: ...
```

A provider owns exactly two things: its SDK call, and translating that
SDK's failures into `AiProviderRateLimitExceeded` / `AiProviderFailedError`.
Nothing else. Prompt construction and response parsing move to the
*feature* asking for the completion — they were already separable, since
`sentence_generation_service.py` had `_build_prompt` and `_parse_candidates`
as free functions calling into the provider, not methods on it.

`max_tokens` becomes a parameter rather than staying an implicit constant,
because the two current callers need genuinely different ceilings: sentence
generation's three candidates fit comfortably under Claude's previous
hardcoded 1024; grading's six verdicts — each carrying two per-word
judgements, feedback, an optional corrected-sentence suggestion, and (as of
the pair-answer-translation work landing in the same epic) a Japanese
translation with its own romaji — do not. Grading passes `3072`. That
number moved once already: it started at `2048` when grading first shipped
without translations, and the translation fields pushed it up again — CJK
text costs roughly one token per character, so a sentence that is ~12
tokens of English becomes ~25 tokens of Japanese, and its romaji adds a
comparable amount again, on the order of +50 tokens per verdict or +300
across a full six-pair run. The alternative to raising it is a silently
truncated response, which surfaces as unparseable JSON — a 502 that
discards a run the learner already wrote — rather than as a short answer,
so headroom is deliberately generous rather than tuned to the minimum that
happened to pass testing.

### The provider layer moves to its own module

`app/services/ai_provider.py` now holds `AiProvider`, `GeminiProvider`,
`ClaudeProvider`, `get_provider()`, and both exception types.
`sentence_generation_service.py` keeps only what is actually about
sentences: `_build_prompt`, `_parse_candidates`, and `generate_sentences`,
which now reads `provider.complete(...)` where it used to read
`provider.generate(...)`. `answer_grading_service.py` is the same shape a
second time — its own `_build_prompt`, its own `_parse_verdicts`, and
`grade_pair_answers` as the entry point — proving the split actually
generalises rather than merely relocating one feature's code.

Both provider classes drop the `Sentence` out of their names
(`GeminiSentenceProvider` → `GeminiProvider`,
`ClaudeSentenceProvider` → `ClaudeProvider`), and so do the two exceptions
(`SentenceGenerationRateLimitExceeded` → `AiProviderRateLimitExceeded`,
`SentenceGenerationFailedError` → `AiProviderFailedError`). They were never
sentence-specific — a Gemini 429 is a Gemini 429 regardless of which
feature triggered it — and grading raising something literally named
`SentenceGenerationRateLimitExceeded` would have been a standing lie in
every stack trace it produced. No aliases are left behind for the old
names; this is a four-file, codebase-internal rename with no external
consumer, so a deprecation shim would only be a second name for the same
thing rather than a compatibility guarantee worth keeping.

The content-line resolver made the same move for the same reason:
`_LINE_RESOLVERS` / `_resolve_source_items` lived in `routes/sentences.py`
because sentence generation was their only caller. Grading needed the
identical `SourceItemRef → real Japanese text` mapping — a model can no
more grade against an opaque UUID than it can generate a sentence from
one — so it moved to `app/services/content_resolver.py` before a second
route grew its own copy. This is a plain move, not a redesign: it keeps
raising `HTTPException` directly from what is nominally a service layer,
matching this codebase's existing "404/409/501 handled at the service
layer" convention rather than introducing a new one partway through the
move.

### Known gap: Gemini's `max_tokens` is accepted but not sent

`GeminiProvider.complete` takes `max_tokens` for protocol conformance and
does not forward it to the SDK call — that client takes the ceiling inside
a `GenerationConfig` object rather than as a call-level argument, and
wiring that up would have been an untested behaviour change riding inside
a refactor whose acceptance test was "sentence generation must work
identically before and after." The practical exposure is low: Gemini's own
default ceiling sits far above anything either caller currently needs, so
nothing is silently truncating today. This is worth fixing deliberately,
with its own verification, rather than as an incidental line in this
change.

### Quota is now shared by two features spending it for two different reasons

Route + schema layers were already unauthenticated per [ADR 012](012-feature-flags-removed-admin-write-gate.md)'s
acceptance of `POST /sentences/generate`'s exposure — one API key per
deployment, no per-user accounting, the provider's own rate limit as the
only backstop. That gap does not get any *worse* here — `get_provider()`
still reads one environment variable and hands back one of two providers,
regardless of which feature called it — but its *shape* changes in a way
worth recording rather than letting the reader assume unchanged: sentence
generation spends quota to **create** content, which a learner does
occasionally; word-pair grading spends the same shared quota to **take**
an exercise, which is the activity the app wants repeated. Both draw from
the same daily allowance now, on the same key, with no coordination
between them beyond both being unauthenticated by the same accepted
design. A capacity-driven failure on one (observed directly during this
work: Gemini's free tier returning `429 RESOURCE_EXHAUSTED — Quota
exceeded … limit: 20`, distinct from the `503 UNAVAILABLE — experiencing
high demand` capacity error the same model separately produced) now also
starves the other, where before there was only one caller to starve.

Nothing in this change adds a rate limiter, a per-feature budget, or a
kill switch. If the two features' combined draw on one key becomes an
operational problem, that is a runtime-settings decision amending this
record or [012](012-feature-flags-removed-admin-write-gate.md) directly —
not a reason to reach for a second environment-branching switch, which is
the exact drift narrowing the protocol to one method was meant to close
off in the first place.

## Consequences

- Adding a third AI-backed feature costs a third `_build_prompt` /
  `_parse_X` pair in that feature's own service module and nothing else —
  `get_provider()`, both provider classes, and both exceptions are already
  shared, and the protocol has no sentence-shaped or verdict-shaped
  assumption left in it for a third caller to collide with.
- `sentence_generation_service.py`, `answer_grading_service.py`, and
  `content_resolver.py` now follow one consistent shape — build a prompt,
  call `provider.complete()`, parse the result, resolving refs through the
  shared resolver first — rather than each feature inventing its own
  version of that seam.
- Verified as behaviour-preserving where it needed to be: the two-file
  provider extraction was checked by diffing the moved block against
  `git show HEAD:` character-for-character rather than by eyeballing the
  diff, and `routes.AiProviderRateLimitExceeded is ai_provider.AiProviderRateLimitExceeded`
  was asserted by identity, not by name — a stray duplicate class
  definition would satisfy a name check and silently stop the route
  catching what the providers actually raise. The full backend suite (38
  tests as of this record) covers the parse and realignment logic on both
  features; grading *quality* is explicitly out of that suite's scope and
  stays a hand-run fixture check against real provider output when the
  rubric prompt changes, the same posture [015](015-romaji-computed-except-grammar.md)
  already takes toward romaji correctness.
- The Gemini `max_tokens` gap above is open, not merely noted — it should
  be closed with its own verification before this deployment's Gemini
  usage grows enough for the SDK default ceiling to matter.
