# ADR 001: Design Tokens as CSS Custom Properties

## Status
Accepted

## Context
Epic 001 (Foundation) needed to port the palette and typography defined
in `sento-ui-mockup.html` into the codebase as the project's actual
design system, not just a static reference. The mockup itself defines
these values as `:root` custom properties. The project already follows
a plain-CSS-modules convention (no Tailwind, no CSS-in-JS) inherited
from prior tooling choices, so the real decision in this epic was
narrower than "pick a styling paradigm" — it was how to represent
shared token values (colors, fonts) within that existing convention.

Two paths were available for the token layer specifically:
- Port the mockup's `:root` block directly into a dedicated
  `tokens.css`, kept separate from component styles
- Represent the same values as a JS object (e.g. `theme.js`), imported
  wherever needed

## Decision
Use a dedicated `src/styles/tokens.css` containing all palette and
typography values as CSS custom properties (`--teal-deep`, `--gold`,
`--font-display`, etc.), imported once into `global.css` and consumed
by every component's CSS module via `var(--token-name)`.

## Alternatives Considered
- **JS theme object (`theme.js`)** — would require a runtime or
  build-time bridge (CSS-in-JS, styled-components, or a
  CSS-variable-injection step) to make the same values usable inside
  plain `.module.css` files, adding a dependency and a translation
  layer that doesn't otherwise exist in this codebase.
- **Tailwind config tokens** — would mean introducing Tailwind
  wholesale this late into a project already using plain CSS modules
  everywhere else, a much larger and unrelated decision this epic
  wasn't scoped to make.

## Consequences
- Every future component styles itself by referencing `var(--token)`
  directly — no import statement, no build step, works in any
  `.css`/`.module.css` file without extra tooling.
- Values can be edited in exactly one place (`tokens.css`) and take
  effect everywhere, including runtime theme changes if ever needed
  later (custom properties are live-updatable; a JS object baked into
  CSS modules at build time would not be).
- Partial-opacity variants (e.g. `rgba(212,168,74,0.25)` for hover
  states) can't be derived from a token directly without
  `color-mix()` or a duplicate token — these get inlined per-component
  as needed, matching how the mockup itself handles it. This is a
  known minor duplication, not a defect to fix later.
