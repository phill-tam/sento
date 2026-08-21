# Epic 011 — Responsive Shell: 1024px Breakpoint, Top Bar and Drawer

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#122](https://github.com/phill-tam/sento/issues/122)

---

## 1. Problem Statement

The app had no `@media` width query anywhere in the bundle. The icon
rail held a fixed `width: 64px` and the sidebar held `flex: 0 0 320px`
all the way down to any viewport, and the content panel took whatever
was left — which ran out fast.

**Correction to the source issue:** #122 is written as a planning
document and says "Status: planned — nothing implemented, ready to
build." That is stale. The epic shipped in full — confirmed against
`CLAUDE.md`'s current "The shell has exactly one width breakpoint" and
"Below 1024px `.lineRail` stops being a sidebar and becomes an overlay
drawer" bullets, against ADR 017
(`docs/adr/017-responsive-shell-breakpoint-and-drawer.md`, written as a
completed decision record with measured verification throughout, not a
proposal), and against merged PRs #123 and #124. This document is
substantially a condensed retelling of ADR 017, which is the fuller
and more authoritative account — read it directly for verification
methodology and exact measurements omitted here.

**The problem, measured** (Study page, sidebar expanded; content box =
viewport − 64 rail − 320 sidebar − 88 `.platform` padding):

| viewport | content box | 180px tiles per row |
|---|---|---|
| 1440 | 968px | 5 |
| 1024 | 552px | 2 |
| 640 | 168px | 0 — no tile fits |
| 375 | **0px** | 0 |

**The trap: the two sidebar states were mutually exclusive.** Collapsed,
the content box was viewport − 152 (a workable 223px at 375px) — but the
sidebar *is* the navigation (`CategoryTree`/`SentenceFolderTree` are the
only way to change what's showing), so reading content and choosing
content could not both happen below roughly 700px. The Generate page
was worse: at 375px `main` measured 88px with the page wrapper inside
it at literally 0.

**Why this is its own epic, not part of epic 010.** Epic 010 (Long-
Content Layout) found this and deliberately deferred it in writing —
"the app has no breakpoints at all … inventing a responsive system for
one component was out of scope" (ADR 016). That deferral was correct:
the flashcard grid already degraded to one column, and epic 010's flip
rows already reflowed cleanly at 375px. The shell was what broke, and
fixing it meant changing `AppShell`, `IconRail` and the sidebar — epic
001 and 002's components, not epic 010's.

**Prior art, read but not merged.** A local-only stash branch,
`wip/responsive-topbar-nav`, had explored the same shape but predated
epics 007–010 entirely. Two ideas were kept — a single content-derived
breakpoint, and `display: contents` as a pattern (though this
implementation didn't end up needing it). Several choices were
deliberately avoided: it rendered `IconRail` twice (desktop + mobile)
rather than restyling one instance; it split `AppShell`'s single
`sidebar` prop into three, against ADR 002; it set `.rail { position:
static }` at narrow widths, which would have dissolved the stacking
context the settings popover depends on; and it carried an unrelated
CORS edit that alone disqualified it from being merged as-is.

---

## 2. Architecture Overview

**One breakpoint, at 1024px, derived from content rather than a device
class.** With the sidebar open, a third column of 180px tiles stops
fitting at a content box of 572px — a viewport of 1044px. 1024 is the
round number just below that, the point where the desktop layout is
already down to two columns. One breakpoint rather than two: the
measured failure is a single event (sidebar and content stop coexisting),
so one boundary describes it honestly, and two tiers would double the
states to design and verify in a codebase with zero prior width media
queries. Container queries were considered — they'd be the better
long-term answer for the grid and lists specifically, which are
container-shaped problems — and declined because the shell's reflow is
a viewport question regardless, and introducing a concept used nowhere
else in the codebase alongside its first-ever breakpoint would be two
new things at once. Crossing the boundary widens the content sharply
(552px → ~983px between 1024px and 1023px) — measured and accepted as
a desktop-resize-only artifact, not a phone-facing one.

**The breakpoint value is duplicated across five places on purpose,**
with no shared source of truth: `AppShell.module.css`,
`IconRail.module.css`, `SettingsButton.module.css`,
`FlashcardGrid.module.css`'s media queries, plus `App.jsx`'s
`NARROW_LAYOUT_QUERY` constant for the two things CSS can't decide
(which slot search and the brand render into). Confirmed in current
code — `1024px` appears across all five of those files plus
`TopBarSearch.module.css`, `ProgressPage.module.css` and others added
by later epics. There's no build step in this toolchain that could
share one value between a stylesheet and a JS string; each duplication
site carries a comment pointing at this fact.

**The rail becomes a horizontal top bar — restyled, not duplicated, and
not the `TopNav` ADR 004 rejected.** Below the breakpoint, `IconRail`
lays out as a row: view buttons, a drawer trigger, search, the settings
gear, the brand mark. It's the same component and the same instance —
`App.jsx` renders one `<IconRail>`, passed extra props
(`onToggleSidebar`, `search`, `brand`) that are `undefined` above the
breakpoint, so the desktop render is byte-identical to before. This
distinction is what keeps ADR 004 intact: it rejected a *section
switcher duplicating the sidebar tree*; this is the existing rail in a
different orientation, same three controls, same component, same
state. ADR 004's first reason (all section-switching already happens
through the sidebar) was a desktop observation that stops holding once
the sidebar is no longer persistently available; its second reason
(risk of looking bolted-on) still stands, and is cleared by this being
a restyle rather than a new addition to the information architecture.

**Search and the brand mark move into the top bar, and nowhere else,
below the breakpoint.** Search lives in the sidebar on desktop; once
the sidebar became a drawer closed by default, that would put the
app's one cross-content-line control two taps away from everywhere —
`searchIndex` matches all three lines at once and matches romaji
regardless of display preference, unlike the category tree. It
collapses to a 44×44px icon (phase 4's tap-target minimum) that
expands to *overlay* the bar rather than push inline, `min-width:
200px`. That minimum comes from the longest realistic romaji query
(`yoroshikuonegaishimasu`, epic 009's own worked example) needing 174px
at the field's real 13px font plus its chrome; 200px is that floor plus
slack. Overlaying rather than expanding inline is a hard requirement at
375px — three rail buttons plus the drawer trigger at 44px each leaves
only ~135px inline, under the 174px floor, while overlaying gives
283px. The brand mark moves for a different reason: it lives at the top
of the sidebar, so below the breakpoint it would sit inside a closed
drawer and the app would have no visible identity on first load. Both
render as one instance each, routed by the same `isNarrow` flag from
`useMediaQuery` — never duplicated with one copy hidden by CSS, since
that would put a duplicate node in the accessibility tree, the same
anti-pattern the WIP branch's duplicate `IconRail` was rejected for.

**The sidebar becomes an overlay drawer, not a band or a push.** It
leaves the flow (`position: fixed`) and slides over the content with a
scrim; content keeps full width underneath in both states. Two
alternatives were rejected: a full-width band collapsing by height (the
WIP branch's approach — the category tree is tall enough to push
content off the bottom of a phone screen), and an off-canvas push
(content is never visible while navigating, and it fights the shell's
existing sticky positioning). Defaults closed below the breakpoint,
reusing `sidebarCollapsed` rather than a second piece of state — the
same boolean means "hidden sidebar" above the breakpoint and "closed
drawer" below it. Four ways to dismiss it: the top bar's trigger, the
scrim, Escape, and an arrow inside the drawer — the arrow exists
because **selecting a category deliberately does not close the
drawer**, so something else has to. The open drawer is modal via the
HTML `inert` attribute on `<main>`, not a hand-rolled focus trap — one
attribute removes the content from the tab order, hit-testing, and the
accessibility tree simultaneously, and is deliberately not applied to
the rail, since the top bar staying reachable while the drawer is open
is the entire point of the stacking decision below.

**The stacking contract: the drawer sits between the top bar and the
content, never above the bar.** This was the epic's one flagged
technical risk, prototyped before any production code. `.rail` keeps
its pre-existing `z-index: 2` (sticky creates a stacking context
unconditionally, so `.rail` has to outrank `.lineRail` directly — no
popover `z-index` inside a stacking context can escape it). Because the
drawer sits *under* the bar, it only has to outrank `.platform` (the
content), not `.rail` — so `SettingsButton`'s popover (`z-index: 20`)
needed no stacking change at all, only an anchoring change (below).
Verified with `document.elementFromPoint` probes at 390px, not by
inspection: the bar returns `TOPBAR` at both edges, the drawer interior
returns `DRAWER` down to a nested `<span>`, the content area returns
`SCRIM`, and the settings popover — opened simultaneously — still wins
its own hit test even at coordinates that geometrically overlap the
drawer.

**A real, pre-existing bug was found during phase-0 prototyping and
fixed, unrelated to the stacking design itself.**
`SentenceFolderTree`'s own `ConfirmDialog` instance (the folder-delete
confirmation) rendered from inside the sidebar slot rather than outside
`.shell`, unlike the top-level guarded-navigation instance in
`App.jsx`. On `main`, before this epic touched anything, that dialog's
backdrop measured clipped to the sidebar's own bounds rather than the
full viewport, and the icon rail stayed clickable underneath what
should have been modal. Confirmed in current code — `ConfirmDialog.jsx`
now unconditionally `createPortal`s to `document.body` inside the
component itself, so the fix covers every caller regardless of where a
future one renders it, rather than depending on each call site
remembering to render outside `.shell`.

**Two behaviours fell out of implementation, both flagged rather than
decided silently.** A non-empty search query opens the (closed-by-
default) drawer, since results with nowhere to render would be useless
— and does not auto-close on an empty query, for the same reason
selecting a category doesn't (the arrow is the deliberate exit). This
exposed a real focus-handling bug: the drawer normally moves focus to
its close arrow on open, which would eject the caret from the search
field after every keystroke that opened it as a side effect. Fixed by
checking whether the currently focused element is a text input before
relocating focus.

**Touch targets and the hover audit are a pointer question, not a
viewport one.** Of fifteen CSS modules using `:hover` at the epic's
start, thirteen were decoration (safe to leave); two carried
information and needed `@media (hover: none)`/`(hover: hover)`
handling — `SentenceFolderTree`'s rename/delete controls, which were
`opacity: 0` until hover and therefore entirely unreachable on touch
(not just undiscoverable), and `SentenceListItem`'s delete button,
which lost its only "this is destructive" cue (a hover border shift)
with no hover to trigger it. Every interactive target under 44px gets
its hit area expanded via a transparent pseudo-element under
`@media (pointer: coarse)` without changing the visible control's own
size — the flashcard ✓ needed an asymmetric inset specifically, since
`preserve-3d`'s hit-testing doesn't extend past a face's own edge, so a
symmetric outward expansion measured only 32px instead of 44.

---

## 3. Data Model

None.

---

## 4. API Surface

None. Frontend-only — no model, route, schema, or migration.

---

## 5. Frontend Components

| Component | Change |
|---|---|
| `components/layouts/AppShell.jsx` | Gained one new prop, `onDismissSidebar` (presence, not value, signals a drawer); `sidebar` remains a single opaque slot (ADR 002 unmodified) |
| `styles/AppShell.module.css` | The one `@media (max-width: 1024px)` block; drawer/scrim CSS; `20px 20px 40px` narrow-layout padding; `100vh` → `100svh` with a `vh` fallback |
| `components/layouts/IconRail.jsx` + `.module.css` | Restyled horizontally below the breakpoint via props, one instance; `.rail { z-index: 2 }` unchanged |
| `components/layouts/SettingsButton.module.css` | Popover anchoring changed (top/right positioning against the bar) — its `z-index: 20` and stacking context were untouched |
| `components/common/TopBarSearch.jsx` (`styles/TopBarSearch.module.css`) | Collapsed 44px icon expanding to a 200px-minimum overlay, narrow-layout only |
| `components/common/ConfirmDialog.jsx` | Now unconditionally portals to `document.body` via `createPortal` |
| `hooks/useMediaQuery.js` | Backs `App.jsx`'s `NARROW_LAYOUT_QUERY`, the one query string shared between JS and (separately, by value) the five CSS files |
| `styles/FlashcardGrid.module.css` | Tile cap `repeat(auto-fill, minmax(180px, 260px))`, scoped to the narrow-layout media query only |

---

## 6. Decisions

Recorded in full in ADR 017; condensed here:

- **One breakpoint at 1024px, content-derived** — not a device class, not two tiers, not container queries (deferred, not rejected outright — the better long-term answer for the grid/lists specifically, but two new concepts at once was too much for a first breakpoint).
- **The rail restyles horizontally rather than being duplicated** — the same instance, same state, so ADR 004 stays scoped to a desktop observation rather than reopened.
- **The drawer sits under the top bar, not over it** — this single choice is what avoids re-deriving the rail's stacking contract or re-homing the settings popover.
- **Overlay drawer, not a band or a push** — a full-height band trades a horizontal squeeze for a vertical one; an off-canvas push fights the shell's existing sticky positioning.
- **The tile cap (`minmax(180px, 260px)`) is scoped to narrow layouts only.** Applying it above the breakpoint too was tried and measured: `auto-fill` counts repetitions from the track's *maximum* sizing function once it stops being `1fr`, so the desktop grid would go from four 226px columns to three 260px ones — moving the tile further from its 210px design width, the opposite of the cap's own justification.
- **Safe-area insets explicitly not handled.** `env(safe-area-inset-*)` resolves to zero without `viewport-fit=cover`, which the app doesn't declare, so building for insets would be writing code against a condition that cannot occur in an ordinary browser tab. Checking it did surface a real bug — four `100vh` usages that don't account for mobile browser toolbar behavior — fixed with `svh` (stable, never clipped in any toolbar state) over `dvh` (tracks the visible viewport exactly, which would reflow a sticky drawer mid-scroll).

---

## 7. Build Plan

| phase | what | PR / commit |
|---|---|---|
| 0 | Prove the stacking — prototype the drawer under the top bar, confirm the settings popover and `ConfirmDialog` still work correctly | prototype only, folded into #123 |
| 1 | The shell reflow — the one media query, `svh`, narrow-layout padding | [#123](https://github.com/phill-tam/sento/pull/123) |
| 2 | The drawer and the top bar — scrim, defaults closed, four dismiss paths, search + brand promotion | [#123](https://github.com/phill-tam/sento/pull/123) |
| 3 | Content surfaces at narrow widths — the tile cap, no horizontal overflow at 375px | [#123](https://github.com/phill-tam/sento/pull/123) |
| 4 | Touch — target expansion, the hover audit, `prefers-reduced-motion` for the drawer | [#123](https://github.com/phill-tam/sento/pull/123) |
| 5 | Docs — ADR 017, CLAUDE.md, README | [#124](https://github.com/phill-tam/sento/pull/124) |

---

## 8. What Actually Shipped, and Where It Differed

- **`ConfirmDialog` portalling to `document.body`** was a real,
  pre-existing bug found during phase-0 prototyping, not part of the
  original design — see §2.
- **The settings popover's anchoring changed twice**, not once. First
  to work in a horizontal bar at all (`right: 0` against the bar rather
  than bottom-aligned against a vertical rail). A later adjustment
  moved the brand mark to the far right of the same bar, which left the
  gear no longer the rightmost control — the popover's anchor moved a
  second time, from the gear itself to the bar's own
  `--topbar-pad-right` custom property, so it wouldn't float short of
  the screen edge. The popover's stacking (`z-index: 20`, confined
  inside `.rail`'s context) never changed either time.
- **Consequences measured directly, not assumed.** Content box at
  375px went from 0px to 335px (Study) and from a 0px page wrapper to
  335px (Generate). Desktop (≥1025px) was re-verified identical to the
  pre-epic baseline after every commit — rail/sidebar/main geometry,
  grid column counts, and which slot search/brand render into.
- **Two known gaps, stated rather than hidden in ADR 017:** the CMS
  upload card's narrow-width behaviour was verified by reading its
  stylesheet only (no fixed/minimum widths present), not exercised
  live, since `VITE_ADMIN_WRITES_ENABLED` was unset in the build
  environment; and every verification in this epic was done by
  measurement (bounding rects, computed styles,
  `document.elementFromPoint`) rather than by screenshot, since the
  preview environment wasn't compositing frames during development.

---

## 9. Explicitly Out of Scope

- **A PWA install.** Needs a manifest, icons, and a service worker; the
  real blocker is that the app cannot function offline at all today —
  every content list comes from the API. Confirmed absent from current
  code (`find frontend -iname "manifest*"` finds nothing;
  `frontend/public/` holds only `favicon.svg`). `display: standalone`
  is also exactly what makes safe-area insets start mattering, so §6's
  "not handled" decision would need revisiting if this is ever built.
- **Container queries.** Considered for the grid/lists specifically and
  deferred, not rejected — see §2.
- **`QuizCard` for long grammar prompts.** Still open from epic 010,
  still not addressed here.
- **The `wip/responsive-topbar-nav` branch.** Read for its two useful
  ideas, never merged or rebased.

---

## 10. Open Questions

None outstanding — every design question in the originating issue was
closed before implementation began (its own "decisions log" section
records this), and ADR 017 records the epic's one open *technical*
risk (the stacking contract) as resolved and verified. The two gaps
noted in §8 (CMS narrow-width behavior unverified live; verification
done by measurement rather than screenshot) are the only unfinished
threads, and are about verification method rather than open design
questions.
