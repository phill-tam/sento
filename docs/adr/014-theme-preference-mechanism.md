# 014 — Theme preference: `data-theme`, three values, stamped pre-paint

**Status:** Accepted
**Builds on:** [013 — Semantic role tokens layered over the pigment palette](013-semantic-role-token-layer.md)

## Context

Epic 008 (#104) adds a night theme. ADR 013 gave the token layer a role
vocabulary so a theme can be expressed as one block of re-pointed
custom properties. This ADR covers the other half: how the app decides
*which* theme is active, and when.

Three questions had to be answered together, because the answers
constrain each other.

**What carries the theme?** The role tokens are CSS custom properties
on `:root`, so the switch has to be something CSS can select on.

**Is the preference a boolean?** The obvious model is `isDark`. But
"follow my OS" is a distinct state from "I chose light", and the two
are indistinguishable on a machine that is currently light.

**When does it get applied?** React state is only available after
mount, and effects run after first contentful paint. Anything that
depends on a React effect to set the theme will render the default
palette for at least one frame first. Epic 008 puts the theme toggle on
the landing gate, so that flash would land on the very screen the
feature is introduced from.

## Decision

**A `data-theme` attribute on `<html>`,** holding the resolved theme
(`"light"` or `"dark"`). `tokens.css` keys off
`:root[data-theme="dark"]`. An attribute rather than a class because it
is single-valued by nature — there is no meaningful state where two
themes are both set, and an attribute makes that structural rather than
a convention.

**A three-valued preference** — `light`, `dark`, `system` — defaulting
to `system`. The *preference* is what gets persisted to
`localStorage` under `sento:theme`; the *resolved* value is what gets
stamped on the element. The two are never conflated in either
direction.

**An inline blocking script in `index.html`** that reads the same key,
applies the same resolution rule, and stamps `data-theme` during head
parsing, before any paint. `ThemeContext` then takes over for the rest
of the session.

## Alternatives Considered

- **Boolean `isDark`.** Smaller API, and wrong. Persisting the resolved
  boolean turns "follow my OS" into a one-time snapshot of it: a user
  who never touched the setting gets frozen at whatever the OS reported
  on their first visit, with no way back to following it. The bug is
  invisible until someone switches their OS to dark and the app does
  not follow.
- **Let `ThemeContext` alone set the attribute, no inline script.** One
  source of truth, no duplication — and a guaranteed light-to-dark
  flash on every single load, because effects run after FCP. The
  duplication is real but bounded: one key name and one three-line
  rule.
- **`prefers-color-scheme` media queries in CSS, no JS at all.** Zero
  flash and zero code, but it makes "follow the OS" the *only* possible
  behaviour. An explicit user override is a hard requirement here — the
  toggle is a named deliverable of the epic.
- **Persist to the backend.** There is no `User` model in this project
  and no auth (ADR 011/012), so there is nothing to key a stored
  preference to.

## Consequences

- **The storage key and resolution rule exist in two places** —
  `index.html` and `context/ThemeContext.jsx` — and can drift. Nothing
  importable can run before first paint, so this is the cost of not
  flashing. Both sites carry a comment naming the other; the context is
  the authority.
- **`localStorage` and `matchMedia` are both wrapped in try/catch** in
  both places. Private browsing and locked-down embeddings throw on
  access, and a theme preference is never worth taking the app down
  for. Failure degrades to light.
- **The OS listener stays attached even under an explicit preference,**
  so returning to `system` later resolves against the OS's current
  value rather than one captured at mount.
- **`color-scheme` is not set yet.** Declaring `color-scheme: dark`
  would restyle native scrollbars and form controls immediately, which
  would look broken while the palette is still light. It belongs with
  the dark values in phase 2.
- **Nothing is themed by this decision alone.** Until phase 2 adds the
  `[data-theme="dark"]` block, the attribute flips and nothing moves.
  That is intentional — it keeps the mechanism reviewable on its own.
