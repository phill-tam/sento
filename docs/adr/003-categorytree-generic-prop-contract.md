# ADR 003: CategoryTree's Generic Prop Contract (count/total/complete, not "mastered")

## Status
Accepted

## Context
`CategoryTree` ports the mockup's folder/station sidebar tree, which
displays a progress badge per category and per item (shown in the
mockup as e.g. "0/14"). The mockup's own internal state models this
as a `mastered` boolean per item, and its UI copy literally reads
"X / Y mastered."

No mastery-tracking feature exists anywhere in the project yet, and
none of the currently planned epics (002 Content Management, 003–004
Flashcards/Quiz, 005 Sentence Generator) formally define what
"mastered" means, when it's set, or how it's computed. `CategoryTree`
still needed a way to display a count/progress badge per node, since
that's part of the mockup's visual design this epic is porting.

## Decision
`CategoryTree`'s prop contract uses generic terms — `count`, `total`,
and a `complete` boolean per item — rather than `masteredCount` or
`mastered`. The component has no opinion on what "complete" means or
how those numbers are computed; it only renders whatever numbers and
booleans it's given.

## Alternatives Considered
- **Port `mastered` terminology directly**, matching the mockup
  literally. Rejected: this bakes an assumption about a feature
  (mastery tracking — likely spaced-repetition or quiz-based scoring)
  into a component that has no involvement in building that feature.
  If mastery tracking is later defined differently than the mockup's
  simple boolean (e.g. a 0–100 confidence score, or SRS intervals),
  every consumer of `CategoryTree` would need to be revisited to
  translate that model into a boolean that no longer makes sense.

## Consequences
- Whatever epic eventually defines progress/mastery tracking can feed
  real numbers into `count`/`total`/`complete` without `CategoryTree`
  itself needing to change — the translation from "real mastery model"
  to "generic display props" happens in the consuming page, not here.
- Short-term cost: consuming pages (once content-line epics exist)
  must compute `count`/`total`/`complete` themselves rather than
  relying on `CategoryTree` to understand a `mastered` field directly.
  This is a small, deliberate shift of responsibility, not overhead
  avoided — someone has to compute these numbers either way.
- If mastery tracking is never built as a real feature, this decision
  costs nothing further — the generic props work fine as a plain
  item-count badge indefinitely.
