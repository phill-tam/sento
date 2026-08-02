# ADR 002: AppShell as a Single Shared Layout Component

## Status
Accepted

## Context
Every page in Sento — content-line study pages, the CMS (epic 002),
Quiz Mode, and the Sentence Generator (epic 005) — needs the same
two-pane structure: a fixed sidebar rail and a main content panel,
matching `sento-ui-mockup.html`'s `.backdrop`/`.shell`/`.line-rail`/
`.platform` layout. This structure needed to exist somewhere before
any of those pages could be built.

## Decision
Build one `AppShell` component (`backdrop` + sticky `sidebar` slot +
`main` panel slot), owned once in `components/layouts/`, and have
every current and future page render inside it rather than defining
its own top-level flex layout.

## Alternatives Considered
- **Each page owns its own layout** — every page independently
  implements the sidebar/main split, backdrop gradient, and sticky
  positioning. Rejected: guarantees drift (padding, breakpoints, or
  the backdrop gradient diverging slightly per page over time) and
  means fixing a layout bug requires finding and patching every page
  that copied the pattern.

## Consequences
- Every future page (CMS, Quiz, Generator) must render inside
  `AppShell`'s `sidebar`/`children` slots — this is now a structural
  constraint those epics build against, not an optional convention.
- Layout bug fixes and structural changes (e.g. sidebar width,
  backdrop gradient) happen in exactly one file and apply everywhere
  automatically.
- `AppShell` is intentionally content-agnostic — it accepts arbitrary
  `sidebar`/`children` nodes and has no knowledge of what's rendered
  inside either slot. Any future page shape that doesn't fit a
  two-pane sidebar+main layout (unlikely, but e.g. a full-bleed
  onboarding screen) would need to bypass `AppShell` entirely rather
  than extend it — not addressed here since no such page exists yet.
