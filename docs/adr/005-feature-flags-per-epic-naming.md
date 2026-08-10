# ADR 005: Feature Flags Named Per-Epic, Not Per-Component

## Status
Superseded by [012 — Feature flags removed; content writes behind an
admin gate](012-feature-flags-removed-admin-write-gate.md). All
per-epic feature flags were deleted once every epic shipped; the naming
convention below no longer applies to anything in the codebase. Kept as
the record of why the flags were named the way they were.

## Context
Epic 001 introduced the project's first frontend feature flag, gating
the new `AppShell`/`ModeToggle`/`CategoryTree` layout behind
`FEATURE_FLAGS` until the shell was complete enough to replace the
existing scaffold. Two naming approaches were available: name the flag
after the component it gates, or after the epic/capability it belongs
to.

The flag was initially implemented as `APP_SHELL` (per-component) in
`App.jsx`, while the flag file itself defined it as
`FEATURE_FOUNDATION_SHELL` (per-epic) — a naming mismatch that caused
a real bug: the app silently fell back to the old scaffold text
because the two names never matched. This was caught during manual
smoke testing, not by any build error, since both are just plain
object property lookups.

## Decision
Feature flags are named per-epic (`FEATURE_<EPIC_NAME>`), not
per-component. This epic's flag is `FEATURE_FOUNDATION_SHELL`,
gating `AppShell`, `ModeToggle`, and `CategoryTree` together as one
unit — not three separate flags.

## Alternatives Considered
- **Per-component naming** (e.g. `APP_SHELL`, `MODE_TOGGLE`,
  `CATEGORY_TREE` as three separate flags) — this is what was actually
  implemented first, and what caused the naming-mismatch bug this ADR
  responds to. Beyond the naming-consistency risk, per-component flags
  for this epic would require three flags to always be flipped in
  sync for the shell to render coherently, meaning they aren't really
  independent decisions — just one decision multiplied into three
  places where it could drift.

## Consequences
- Every future epic's flag follows `FEATURE_<EPIC_NAME>` — e.g. epic
  002's `FEATURE_CONTENT_MANAGEMENT` — establishing a single
  predictable pattern rather than requiring a fresh naming decision
  per feature.
- Per-epic naming assumes an epic's components ship as one atomic
  unit. If a future epic has genuinely independently-shippable pieces
  (e.g. epic 002's CSV upload going live before its inventory tree UI
  is ready), that epic may warrant splitting into more than one flag —
  a call to be made per-epic based on its internal structure, not a
  blanket exception to this convention.
- This flag is a release toggle in Martin Fowler's taxonomy sense —
  short-lived, meant to be removed once the gated feature is
  permanently on. It is not an ops toggle, permission toggle, or
  experiment toggle, and this convention isn't claimed to generalize
  to those other flag categories.
