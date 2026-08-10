# 013 — Semantic role tokens layered over the pigment palette

**Status:** Accepted
**Amends:** [001 — Design tokens as CSS custom properties](001-design-tokens-css-custom-properties.md)

## Context

Epic 008 (#104) adds a night theme with its own palette, drawn from
`hero-night.gif`. The token layer from ADR 001 cannot carry it.

ADR 001 ported the mockup's `:root` block verbatim, so every token is
named for its **pigment** — `--teal-deep`, `--gold`, `--sky`, `--cream`,
`--ink`, `--mist`, `--mist-line`. It anticipated theming ("custom
properties are live-updatable ... including runtime theme changes if
ever needed later"), but two of its properties block it in practice.

**A pigment token can hold more than one role, and the roles move in
opposite directions under a theme swap.** Three of the seven color
tokens are load-bearing in two places at once:

| token | role A | role B |
|---|---|---|
| `--mist-line` `#3a5f5e` | border on light cards (`QuizCard`, `SentenceList`, …) | muted body text on light cards (`QuizCard:40`, `StudyPage:35`, `QuizSummary:13`) |
| `--mist` `#6f9c9a` | muted text on the **dark** rail/sidebar (`IconRail:28`, `Sidebar:19`) | hint/empty-state text on **light** pages (`FlashcardGrid:8`, `GeneratePage:24`) |
| `--teal-deep` `#0f2c2e` | chrome background (rail, sidebar) | primary **button** fill, against a light page (`ConfirmDialog:55`, `QuizCard:107`, and four more) |

Re-pointing any of these for a dark theme satisfies one role and breaks
the other. No amount of care in the dark palette fixes that; the names
have to split first.

**A third of the color decisions never reach the token layer.** 19 of
27 CSS modules carry hardcoded color: 104 literals against ~190
`var()` references. ADR 001 accepted this deliberately — its final
consequence records that partial-opacity variants "get inlined
per-component as needed ... a known minor duplication, not a defect to
fix later." That trade was correct for a single fixed palette. Under a
theme switch those 104 sites are simply invisible: `rgba(212,168,74,·)`
alone appears 30+ times at a dozen opacities and would keep rendering
the day palette on a night surface.

A further wrinkle: the app is **not uniformly light**. The icon rail and
sidebar are already dark (`--teal-deep` ground, `--sky` text,
`--gold-light` accents) while the content area is light (cream cards,
ink text). The night theme is therefore not an inversion — chrome stays
dark and shifts hue, content surfaces flip. Any role vocabulary has to
name "on chrome" separately from "on page", or a single `--text-primary`
will be wrong in one of the two.

## Decision

Add a **role layer** to `tokens.css`, declared in terms of the existing
pigment tokens, which stay exactly as they are and become the light
theme's data:

```css
--surface-card: var(--cream);
--text-secondary: var(--mist-line);
--border: var(--mist-line);        /* same pigment, different role */
```

Component modules reference **only** role tokens. Pigment tokens become
private to `tokens.css`. A theme is then a block that re-points the role
layer, and no module needs to know a theme exists.

The vocabulary splits by context (`-on-chrome` for the rail/sidebar/
popover surfaces), and names the three dual-role pigments apart:
`--border` vs `--text-secondary`, `--text-hint` vs
`--text-on-chrome-muted`, `--chrome-surface` vs `--btn-primary-bg`.

Opacity variants get named tokens (`--accent-wash`, `--accent-line`,
`--accent-ring`, `--good-wash`, `--bad-wash`), reversing ADR 001's
"inline it per component" position for colors that must respond to a
theme.

## Alternatives Considered

- **Re-point the pigment tokens per theme, leave the names alone.**
  Cheapest possible diff, and wrong for the three dual-role tokens
  above — one of each pair breaks. It also leaves `--cream` naming a
  dark indigo, which lies to the next reader.
- **`color-mix()` / `light-dark()` instead of a role layer.** Both are
  now widely supported and would collapse the wash tokens neatly. They
  solve the *derivation* problem, not the *naming* problem: a
  `color-mix()` on `--teal-deep` still can't tell chrome from a button.
  Worth revisiting for the wash ladder specifically, once the role
  layer exists.
- **A CSS-in-JS or JS theme object.** Rejected for the same reasons as
  ADR 001 — it would introduce the dependency and translation layer
  that decision was made to avoid.

## Consequences

- **One mechanical migration, once.** 19 modules move off raw literals.
  It is deliberately staged as no-visual-change commits, one per
  surface, so each is verifiable by screenshot before any dark value
  exists.
- **The indirection is the point — don't "simplify" it away.** A future
  reader will see `--surface-card: var(--cream)` and be tempted to
  collapse it. That collapse re-breaks theming. This ADR is the answer
  to "why two layers?".
- **Adding a theme becomes one block, not an audit.** Because roles are
  named, `:root[data-theme="dark"]` re-points ~30 declarations, and
  every module follows automatically.
- **The wash ladder gets normalized, and that is a visual change.** The
  inlined literals use `rgba(212,168,74,·)`, which is not `--gold`
  (`#d3a54c` = `211,165,76`), and the same semantic wash appears at
  0.08/0.10/0.12 in different modules. Consolidating them shifts a few
  values by an imperceptible but real amount. That normalization is
  kept in its own commit rather than smuggled into a no-op refactor.
- **Not every literal becomes a token.** One-off decorative values with
  no theme obligation (the `#fffdf6` gradient start in `FlashcardCard`,
  already commented as the mockup's own hardcoded value) stay inline.
  The test is "must this change under a theme?", not "is it a color?".
