# ADR 007 — Content Management Tables Decoupled from Sentence Generator's Item Table

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

The Sentence Generator (epic 005) already has its own `Item` table, used
to generate practice sentences from learner-selected vocabulary/grammar.
Epic 002's `KanjiEntry`/`VocabEntry`/`GrammarEntry` tables cover
conceptually overlapping ground — a word entered as a `VocabEntry` for
study purposes might also be useful as an `Item` for sentence generation.

A unified design (one table serving both study content and generation
input) was considered but not attempted, because no real usage data
exists yet to inform what that merge should actually look like — which
fields would need to be shared, which would stay generation-specific vs.
study-specific, and whether the two features' content even overlaps as
much in practice as it appears to in theory.

## Decision

Epic 002's content tables are built with **no relationship, foreign key,
or shared identity** to the Sentence Generator's `Item` table. The two
systems are entirely independent. This means the same word could
legitimately need to be entered twice — once as an `Item`, once as a
`VocabEntry` — if it's useful in both contexts.

This duplication is accepted, not solved, in this epic.

## Consequences

**Positive:**
- Epic 002 shipped without taking on the Sentence Generator's schema as a
  dependency or constraint — no coordination required, no risk of
  destabilizing an already-built, working feature.
- No premature abstraction: a unification design built without real usage
  data would very likely need to be redone once actual overlap patterns
  are known, wasting the effort spent guessing.

**Negative:**
- An author using both the CMS and the Sentence Generator's own content
  entry (if any) may need to enter the same word twice.
- No single source of truth for "is this word known to the system" across
  both features — a query would need to check both `Item` and the
  relevant `*Entry` table.

## Alternatives Considered

**Unify now — single content table serving both features.** Rejected —
no usage data exists to justify the merge design; building it now means
guessing at a schema that later evidence might invalidate.

**Foreign key from `*Entry` to `Item` (or vice versa), without full
unification.** Rejected for the same reason as full unification — even a
loose reference implies a relationship model that hasn't been validated
by actual use of both features together.

## Follow-up

Tracked as a Planned Upgrade in the epic 002 doc: revisit unification if
and when the duplication proves genuinely painful in practice, backed by
real usage rather than anticipated need.