# ADR 004: Sidebar-Only Navigation — TopNav Dropped in Favor of ModeToggle

## Status
Accepted

## Context
The epic 001 steps file originally scoped a `TopNav` component: a
top-level section switcher between the three content lines, Quiz, and
the Sentence Generator, with a separate entry point for the CMS. This
was explicitly flagged as an open question in the steps file itself
("Confirm the nav split... matches intent").

A design review found no justification for a separate persistent top
bar — all section-switching can happen through the sidebar tree
(`CategoryTree`), and the only other switching control needed is a
per-page header toggle scoped to whatever content line is currently
active, not a global top-level nav.

A prototype `TopNav` bar was built and evaluated directly rather than
decided from description alone. After review, the decision was to
drop it and instead extend the per-page mode toggle with a third
option: a visually distinct "Sentence Generator" button with an
animated gold-glow border, signaling it as a special AI-powered action
distinct from the plain Study/Quiz view-mode toggles.

## Decision
No `TopNav` component. Navigation between content lines happens
entirely through `CategoryTree` (the sidebar). Cross-section access to
the Sentence Generator is handled by a shared `ModeToggle` component,
rendered per content-line page, exposing an `onGeneratorClick`
callback rather than a hardcoded route (no router exists in the
codebase yet).

## Alternatives Considered
- **(A) Build `TopNav` as originally scoped**, styled with the
  project's tokens despite having no validated design reference.
  Rejected: introduces a UI element with real risk of looking
  bolted-on, likely needing rework once real requirements (e.g. the
  CMS entry point) are designed.
- **(B) Sidebar-only, no equivalent for Generator access at all** —
  drop `TopNav` and leave Sentence Generator access undesigned until
  epic 005. Rejected: prior planning already established the
  Generator needs to be reachable from every content-line page, so
  deferring it entirely would leave a known gap unaddressed rather
  than solved.
- **(C) Repurpose the per-page mode toggle as the answer** — extend it
  with a third, visually distinct option. **This is the option
  chosen**, refined into the final decision above after a working
  preview confirmed it held together visually.

## Consequences
- Epic 002's CMS entry point, which was designed *assuming* `TopNav`
  existed as "a separate entry point rather than a peer tab," needs to
  be redesigned — this ADR directly invalidates that assumption and
  must be resolved before epic 002's navigation-related steps proceed.
- `ModeToggle` is now a shared, reusable component (not page-specific
  markup) specifically so its glow animation and Generator-access
  logic exist in one place — every content-line page renders the same
  component rather than duplicating a styled button with animation
  CSS three times.
- No client-side router exists yet. `onGeneratorClick` is a callback
  prop with no real navigation behind it — this is a known deferred
  gap, to be resolved once epic 005 (or whenever routing is
  introduced) needs it, not a decision made or hidden here.
