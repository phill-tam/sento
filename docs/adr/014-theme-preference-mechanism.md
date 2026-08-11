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

**Is the preference a boolean?** The obvious model is `isDark`. The
alternative is a third value, `system`, meaning "keep following the OS"
— distinct from "I chose light", and indistinguishable from it on a
machine that is currently light.

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

**A two-valued preference** — `light` or `dark` — defaulting to
`light`, persisted to `localStorage` under `sento:theme`. It is stored
and stamped as the same value; there is nothing to resolve.

This reverses an earlier decision in this ADR and the reversal is worth
recording, because the original reasoning was sound and stopped being
so once something else changed.

The first version modelled three values, adding `system` to track
`prefers-color-scheme`, on the argument that persisting a resolved
boolean would freeze "follow my OS" at whatever the OS reported on the
first visit. That argument holds **only while following the OS is the
default**, which it originally was.

Day is now the default instead. The day palette is the one this project
was designed around, the hero is the day scene, and every screenshot of
it is light — following the OS meant a dark-OS visitor met a version of
the app nobody had chosen as its introduction.

Once day became the default, nobody arrived in `system` mode, so it
survived only as a state the UI could not select — `setPreference` had
no caller anywhere. Briefly there was a "Follow system" switch to make
it reachable, but it existed to justify the value rather than because
anyone had asked to follow their OS. Removed rather than left
unreachable: a modelled state nothing can reach is a liability, and the
boolean the original decision rejected is simply correct once the
default is explicit.

**An inline blocking script in `index.html`** that reads the same key,
applies the same resolution rule, and stamps `data-theme` during head
parsing, before any paint. `ThemeContext` then takes over for the rest
of the session.

## Alternatives Considered

- **A third `system` value tracking `prefers-color-scheme`.** This was
  the original decision here, and is now rejected — see above. It is
  only correct while following the OS is the default; with an explicit
  default it becomes a state nothing selects.
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

- **The storage key and its rule exist in two places** — `index.html`
  and `context/ThemeContext.jsx` — and can drift. Nothing importable
  can run before first paint, so this is the cost of not flashing. Both
  sites carry a comment naming the other; the context is the authority.
  Dropping `system` shrank the duplicated rule to a single comparison,
  which makes the drift risk smaller than it was.
- **`localStorage` access is wrapped in try/catch** in both places.
  Private browsing and locked-down embeddings throw on access, and a
  theme preference is never worth taking the app down for. Failure
  degrades to light.
- **The app ignores `prefers-color-scheme` entirely.** A visitor whose
  OS is dark still gets day on first load. That is the intended
  behaviour, not an oversight — but it is the thing to revisit first if
  anyone ever asks why the app does not follow their system.
- **`color-scheme` is declared per theme** so native scrollbars and
  form controls follow the palette. It was deliberately held back from
  the first version of this decision, since declaring it before the
  dark values existed would have darkened controls against a light
  palette.
- **Nothing is themed by this decision alone.** Until phase 2 adds the
  `[data-theme="dark"]` block, the attribute flips and nothing moves.
  That is intentional — it keeps the mechanism reviewable on its own.
