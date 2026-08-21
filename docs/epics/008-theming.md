# Epic 008 — Theming: Dark Mode & Semantic Token Layer

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#104](https://github.com/phill-tam/sento/issues/104)

---

## 1. Problem Statement

A user-selectable night theme, with its own palette drawn from
`frontend/src/assets/hero-night.gif`, plus a semantic token layer the
existing tokens couldn't provide.

**Correction to the source issue:** #104 is written as a planning
document and states "Status: planned — nothing implemented yet" with
every phase checkbox unchecked. That is stale. The epic shipped in
full — confirmed against `CLAUDE.md`'s current "tokens.css has two
layers", "The night theme is one block, not a second stylesheet," and
"Theme state" bullets; against ADR 013 and ADR 014, both written as
accepted decisions rather than proposals; and against five merged PRs
(§7). This document describes the epic as shipped, translating the
issue's `- [ ]` phase items to completed work throughout, with one real
divergence from the original plan called out in §8.

**Why this isn't just a `[data-theme]` block.** `tokens.css` named
colors by *pigment* (`--teal-deep`, `--gold`, `--sky`, `--cream`,
`--ink`, `--mist`, `--mist-line`), not by *role*. Three of those seven
tokens were load-bearing in two places that a theme swap wants to move
in opposite directions — `--mist-line` was both a card border and muted
body text, `--mist` was muted text on dark chrome *and* hint text on
light pages, `--teal-deep` was the chrome background *and* the primary
button fill. Re-pointing any one of them for a dark theme would satisfy
one role and break the other. Separately, of 27 CSS modules, 19 carried
hardcoded hex/rgba color literals — 104 of them, against roughly 190
`var(--token)` references — invisible to any theme switch entirely;
`rgba(212, 168, 74, …)` alone appeared 30+ times at a dozen different
opacities as an unnamed, copy-pasted "gold wash."

So the ordering was semantic layer first, dark values second — the
bulk of the work shipped zero visual change.

---

## 2. Architecture Overview

**A role layer sits over the pigment layer, and only the role layer is
public.** `tokens.css` keeps the pigment tokens as private, unchanged
light-theme data (`--teal-deep`, `--gold`, `--cream`, `--mist-line`,
the `--night-*` ramp) and adds role tokens (`--surface-card`,
`--text-secondary`, `--border`, `--accent-*`, `--shadow-*`) that
component CSS references exclusively. `grep 'var(--teal\|--gold\|
--cream\|--ink\|--mist' src/styles/*.module.css` stays empty. See ADR
013 for the full reasoning, including the vocabulary split by context
(`-on-chrome` variants for the rail/sidebar/popover surfaces, since the
app was never uniformly light — chrome was already dark before this
epic, and stays dark at night while content surfaces flip).

**The night theme is one block, not a second stylesheet.**
`:root[data-theme="dark"]` at the bottom of `tokens.css` re-points the
role layer and nothing else — no component knows a theme exists. It's
deliberately not a straight inversion: the icon rail and sidebar were
already dark against a light content area pre-epic, so at night the
chrome shifts hue and stays put while the content surfaces come down to
meet it.

**Palette reference.** Dominant colors quantized from `hero-night.gif`
frame 0: `#2e3371` (44.1%, primary surface), `#464486` (25.0%, raised
surface), `#0e0e2c` (11.4%, sunken surface), several mid-tone/border
values in the 1–9% range, and the moon at `#eee4ab`/`#f5edc7`
(<1% combined). The accent survives the swap deliberately — the moon
sits within a hair of the existing `--gold-light` (`#f0d38f`), and the
lantern glow lands right on `--gold` (`#d3a54c`), so gold stays gold in
both themes and only surfaces/text invert. That's why `ToggleSwitch`,
`.startBtn`, and the focus/hover treatments needed little rework.

**A component can get its own day-only role tokens, re-pointed back to
the shared token at night.** `QuizCard` and `PairPromptCard` (a later
epic) restyle to a dark teal fill with gold type by day — a look no
other card uses. Their tokens (`--quiz-card-bg`, `--text-on-quiz-card`,
etc.) still live in the same `:root` block as everything else; the
pattern that's new is that night re-points every one of them straight
back to the ordinary shared token (`--quiz-card-bg: var(--surface-card)`),
so at night those cards render through the exact same custom-property
chain as everything else. This pattern, established here, is reused by
every later epic that needs a component-specific look (`--progress-btn-bg`
in epic 015, for one).

**Theme state is `data-theme` on `<html>`, stamped pre-paint.**
`context/ThemeContext.jsx` reads/writes `sento:theme` in `localStorage`
(values `light`/`dark` only, default `light`) and stamps it straight
onto `document.documentElement` — there's nothing to resolve. Because
React state is only available after mount and effects run after first
contentful paint, the stored-value rule is duplicated as a blocking
inline script at the top of `frontend/index.html` (confirmed present,
reading `localStorage.getItem("sento:theme")` before any paint), so the
theme applies before first paint instead of flashing light and then
switching. If the rule changes, both copies have to change together.

**The app ignores `prefers-color-scheme` entirely — deliberate, not an
oversight.** See §8 for the "system" value this originally shipped
with and the reasoning for removing it.

---

## 3. Data Model

None. This epic touches no backend model, route, schema, or migration.

---

## 4. API Surface

None.

---

## 5. Frontend Components

| Component / Module | Purpose |
|---|---|
| `styles/tokens.css` | Role layer added over the existing pigment layer; `:root[data-theme="dark"]` block |
| `context/ThemeContext.jsx` | `sento:theme` preference, lazy read, effect write-back, stamps `data-theme` on `<html>` |
| `frontend/index.html` | Inline blocking pre-paint script duplicating the theme-resolution rule |
| `components/common/ToggleSwitch.jsx` | Gained an `orientation` prop (`horizontal` default, `vertical`) for the gate's theme switch |
| `components/common/StartGate.jsx` | Carries the vertical theme toggle beside Start, absolutely positioned against a wrapper so Start stays centered |
| `components/common/SettingsPanel.jsx` | General settings popover hosting both Sound and Theme rows — this epic folded epic 007's sound-only `SoundSettingsPanel` into it, since a theme row belonged beside sound rather than bolted onto it |
| `frontend/src/assets/hero-night.gif` | Night hero background and palette reference |

---

## 6. Decisions

### ADR 013 — Semantic role token layer over pigment tokens

Amends ADR 001. Adds the role vocabulary described in §2; the pigment
layer stays exactly as it was and becomes the light theme's data. The
indirection is the point — a future reader collapsing
`--surface-card: var(--cream)` back to `--cream` directly re-breaks
theming, which is exactly what this ADR exists to prevent.

### ADR 014 — Theme preference mechanism: `data-theme`, two values, stamped pre-paint

`data-theme` on `<html>` rather than a class (single-valued by nature —
there's no meaningful state with two themes set at once). A two-valued
preference (`light`/`dark`, default `light`), not three — see §8 for
why a third `system` value was tried first and removed. An inline
pre-paint script rather than letting `ThemeContext` alone set the
attribute, accepting duplicated logic in two places to avoid a
guaranteed flash on every load. `color-scheme` declared per theme (once
dark values existed) so native scrollbars and form controls follow the
palette.

### The vertical `ToggleSwitch` orientation, not a second component

`ToggleSwitch` gained an `orientation` prop rather than a parallel
vertical component — confirmed in current code
(`components/common/ToggleSwitch.jsx`, `orientation = 'horizontal'`
default, `isVertical` branch). The vertical variant is scoped under its
own class and inert for every existing horizontal caller.

---

## 7. Build Plan

| phase | what | PR |
|---|---|---|
| 0 | Semantic role token layer, no visual change | [#105](https://github.com/phill-tam/sento/pull/105) |
| 1 | Theme preference mechanism | [#106](https://github.com/phill-tam/sento/pull/106) |
| 2 | Night palette + per-component audit | [#107](https://github.com/phill-tam/sento/pull/107) |
| — | Theme controls, day default, and follow-up fixes | [#108](https://github.com/phill-tam/sento/pull/108) |
| — | Day default, night wash weights, follow-system switch removal | [#109](https://github.com/phill-tam/sento/pull/109) |
| docs | Record epic 008 in README and CLAUDE.md | [#111](https://github.com/phill-tam/sento/pull/111) |

---

## 8. What Actually Shipped, and Where It Differed

**A `system` value was built, then removed — the one real reversal in
this epic.** The original plan (phase 1 in issue #104) proposed three
preference values, adding `system` to track `prefers-color-scheme`, so
"follow my OS" would be a real choice. It shipped that way first. The
reasoning held only while following the OS was the *default* — once
day became the default instead (the day palette is what the project was
designed around, the hero is the day scene, and every existing
screenshot is light), nobody ever arrived in `system` mode, so
`setPreference("system")` had no caller anywhere. A brief "Follow
system" switch was added to make the state reachable, then removed
(PR #109) — it existed only to justify the value, not because anyone
had asked to follow their OS. ADR 014 records this reversal explicitly
rather than pretending the two-value design was the original one: "a
modelled state nothing can reach is a liability." Don't reintroduce
`system` without reading ADR 014 first.

**`prefers-color-scheme` is ignored by the running app, on purpose.** A
visitor whose OS is dark still gets day on first load. This is the
direct consequence of the reversal above, not a separate oversight.

---

## 9. Open Questions

- **Does the night theme keep `hero.gif`'s day scene anywhere, or is
  the swap total?** Both assets exist side by side
  (`frontend/src/assets/hero.gif`, `hero-night.gif`); `AppShell.module.css`
  branches the hero per theme rather than tokenising it (per CLAUDE.md,
  since each wash is welded to its own hero image). The swap is total —
  no day-scene fragment persists at night.
- **`prefers-reduced-motion` folded into the theme transition, or kept
  separate?** Raised in the original issue alongside epic 007's already-
  open motion gap; not resolved by this epic specifically. Epic 010 and
  011 later added `prefers-reduced-motion` handling for their own
  animations (the flip, the drawer) — worth checking whether the theme
  toggle itself needs the same treatment if this is revisited.
