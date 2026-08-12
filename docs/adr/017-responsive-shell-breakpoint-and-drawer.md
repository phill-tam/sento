# 017 — The 1024px breakpoint, the drawer's stacking contract, and scoping ADR 004 to desktop

**Status:** Accepted
**Related:** [002 — AppShell single shared layout](002-appshell-single-shared-layout.md), [004 — Sidebar-only navigation, TopNav dropped](004-sidebar-only-navigation-topnav-dropped.md), [010 — Two-tier sidebar collapsible navigation](010-two-tier-sidebar-collapsible-navigation.md), [013 — Semantic role token layer](013-semantic-role-token-layer.md), [016 — Per-category layout and the flip-height mechanic](016-per-category-layout-and-flip-height.md)

## Context

The app had no `@media` width query anywhere in the bundle — the only
two `@media` rules that existed before this epic were epic 010's
`prefers-reduced-motion` flip guards. The icon rail held `width: 64px`
and the sidebar held `flex: 0 0 320px` all the way down to any viewport,
and the content panel took whatever was left.

Measured on `main` before this epic, Study page, sidebar expanded:
content box = viewport − 472. At 375px that is **0px**. The tile grid
rendered zero pixels wide, and `main` itself measured 88px — exactly its
own horizontal padding and nothing else. The Generate page was worse:
its sidebar carries the sentence-folder tree rather than the category
tree, and `main` there measured the same 88px with the page wrapper
inside it at literally 0.

Collapsing the sidebar gave a workable 223px, but the sidebar *is* the
navigation — `CategoryTree` and `SentenceFolderTree` are the only way to
change what's showing — so reading content and choosing content could
not both happen below roughly 700px. Two states, mutually exclusive,
neither good.

Epic 010 (#116, ADR 016) found this and deliberately did not fix it.
Its own record: "the app has no breakpoints at all … inventing a
responsive system for one component was out of scope." That deferral
was correct — the content surfaces were not what broke. The flashcard
grid already degraded to one column, and epic 010's own flip rows
already wrapped and reflowed cleanly at 375px. **The shell was what
broke**, and fixing it meant changing `AppShell`, `IconRail` and the
sidebar — epic 001 and 002's components, not epic 010's — which is why
this is its own epic (#122) rather than a continuation of #116.

A local-only WIP branch (`wip/responsive-topbar-nav`, last touched
2026-08-06, never pushed) had explored the same shape — a single
breakpoint collapsing `.shell` to a column — but predated epics 007–010
entirely (no settings gear, no sound, none of the sticky-stacking work
recorded below) and was not merged or rebased. Two of its ideas were
kept (a single content-derived breakpoint; `display: contents` wrapper
slots as a *pattern*, though this implementation didn't end up needing
it) and several of its choices were avoided on purpose: it rendered
`IconRail` twice — once for desktop, once inside a separate mobile bar —
with a comment conceding the reason was that CSS Modules can't share
scoped class names across files; it split `AppShell`'s single `sidebar`
prop into `sidebarBrand` / `sidebarSearch` / `sidebarBody`, which
directly contradicts ADR 002; and it set `.rail { position: static }` at
narrow widths, which would have dissolved the stacking context the
settings popover depends on (see below).

## Decision

### One breakpoint, at 1024px, derived from content rather than a device class

With the sidebar open, a third column of 180px tiles stops fitting at a
content box of 572px, which is a viewport of 1044px. 1024 is the round
number just below that — the point where the desktop layout is already
down to two columns, so anything narrower is spending 384px of chrome to
show less content than the chrome costs.

One breakpoint rather than two: the measured failure is a single event
(the sidebar and the content stop being able to coexist), so one
boundary describes it honestly, and two tiers would double the states to
design and keep from drifting in a codebase that had zero width media
queries to start from. Container queries were considered for the same
reason and declined for the same one — they'd be the better long-term
answer for the grid and the lists, which really are container-shaped
problems, but the shell's reflow is a viewport question regardless, and
introducing a concept used nowhere in the codebase alongside its
first-ever breakpoint would be two new things at once.

**A one-pixel discrepancy worth recording rather than silently
resolving.** The originating issue's phase-1 checklist specifies
`@media (max-width: 1024px)`, but its own measurement table treats
1024px as still being the desktop layout (the "1024 → 552px, 2 columns"
row). The two disagree by a pixel. This implementation uses the literal
query, so at exactly 1024px the narrow layout applies. If the table was
the intended boundary, the fix is a one-character change to
`1023.98px`; nothing else in this record depends on which value wins.

Crossing the boundary widens the content sharply — a 552px content box
at 1024px (2 columns) against roughly 983px at 1023px (5 columns).
Measured directly: 538px at 1025px against 984px at 1024px, matching
prediction within scrollbar width. That pop is only ever visible to
someone resizing a desktop window; a phone never crosses it. It reads
less as an argument against the breakpoint than as evidence that a
permanently reserved 320px sidebar was expensive at *every* width.

**The breakpoint value is duplicated, not shared, across five places**
— `AppShell.module.css`, `IconRail.module.css`,
`SettingsButton.module.css` and `FlashcardGrid.module.css`'s `@media`
queries, plus `App.jsx`'s `NARROW_LAYOUT_QUERY` constant for the two
things CSS cannot decide (which slot search and the brand render into).
There is no build step in this project that could share one value
between a stylesheet and a JS string, and PostCSS custom media isn't in
the toolchain. Each duplication site carries a comment pointing at this
fact. Change the number in all five places together, or the JS-decided
slots and the CSS-decided layout disagree about where the line is.

### The rail becomes a horizontal top bar — restyled, not duplicated, and not the `TopNav` ADR 004 rejected

Below the breakpoint, `IconRail` lays out as a row: view buttons, a
drawer trigger, search, the settings gear, the brand mark. It is the
same component and the same instance — `App.jsx` renders one
`<IconRail>`, passed extra props (`onToggleSidebar`, `search`, `brand`)
that are `undefined` above the breakpoint, so the desktop render is
untouched down to the DOM node. This was verified directly rather than
assumed: at 1440px the rail's children after this epic are
`[Study, Generate, <settings div>]`, identical to before.

**This distinction is what keeps ADR 004 intact rather than reopening
it.** ADR 004 rejected a `TopNav` for two reasons: every
section-switch could already happen through the sidebar tree, and a
persistent top bar with no validated design risked looking bolted-on.
The first reason was a *desktop* observation, and it stops being true
here — once the sidebar is an overlay drawer rather than a permanent
fixture, it is no longer persistently available, so something has to
carry view-switching and the drawer trigger while it's closed. The
second reason still stands, and is the bar this epic had to clear: it
does, by being the *existing* rail in a different orientation rather
than a second thing introduced beside it. Nothing new was added to the
information architecture — the same three view buttons, the same
settings gear, the same controlled state.

### The sidebar becomes an overlay drawer, not a band or a push

It leaves the flow (`position: fixed`) and slides over the content with
a scrim; the content keeps its full width underneath in both states.
Two alternatives were rejected:

- **A full-width band collapsing by height** (what the WIP branch
  built). The category tree is tall, and an expanded tree would push
  the content clean off the bottom of a phone screen — trading a
  horizontal squeeze for a vertical one.
- **Off-canvas push**, sliding the content sideways along with the
  drawer. The content is never visible while navigating, and pushing a
  `position: sticky` shell fights the sticky positioning the app
  already depends on.

**Defaults closed below the breakpoint**, matching `sidebarCollapsed`'s
existing desktop default. There is no second piece of state: the same
boolean means "hidden sidebar" above the breakpoint and "closed drawer"
below it, decided by a `useMediaQuery` hook reading the same query
string as the CSS. `handleStart` opens the sidebar on desktop as it
always did and leaves it closed below. Crossing *down* into the narrow
layout while the sidebar happens to be open closes the drawer — one that
opened itself mid-resize would be covering the content the visit was
for.

**Four ways to dismiss it: the trigger, the scrim, Escape, and an arrow
inside the drawer.** The arrow exists because **selecting a category
deliberately does not close the drawer** — picking several categories in
a row should not mean reopening it each time — so something else has to.
The open drawer is modal via the HTML `inert` attribute on `<main>`
rather than a hand-rolled focus trap: one attribute removes the content
from the tab order, from hit-testing, and from the accessibility tree
simultaneously. It is deliberately *not* applied to the rail — the top
bar staying reachable while the drawer is open is the entire point of
the next section.

### AppShell keeps its single `sidebar` slot

ADR 002 holds without modification. `AppShell` gained one new prop,
`onDismissSidebar` — presence rather than value is the signal that the
sidebar is currently a drawer — but that prop describes the drawer
`AppShell` itself now owns and renders (the scrim, the close arrow), not
what fills the slot. `sidebar` remains one opaque node passed in by the
caller, exactly as before. The WIP branch's alternative — splitting the
slot into `sidebarBrand` / `sidebarSearch` / `sidebarBody` — was
available and was not taken.

### The stacking contract: the drawer sits *between* the top bar and the content, never above the bar

This was flagged as the epic's one open technical risk and was
prototyped before any production code was written, against the stacking
map CLAUDE.md already records as load-bearing:

| element | z-index | note |
|---|---|---|
| `.backdrop` | 0 | fixed, sibling of `.shell` |
| `.shell` | 1 | its own stacking context |
| `.lineRail` (sidebar/drawer) | 1 | `position: sticky` on desktop, `fixed` in the drawer state |
| `.rail` (icon rail/top bar) | 2 | sticky/sticky; outranks the sidebar on purpose |
| `SettingsButton` popover | 20 | confined *inside* `.rail`'s own stacking context |
| `ConfirmDialog` | 10 | deliberately rendered outside `.shell` — see below |

Sticky positioning creates a stacking context unconditionally (unlike
`relative`/`absolute`, which only do so with a non-`auto` `z-index`),
which is why `.rail` has to outrank `.lineRail` directly rather than the
popover raising its own `z-index` — a `z-index` inside a stacking
context can never escape it, no matter how large. **The decision that
the drawer sits under the bar, not over it, is what avoids re-deriving
any of this.** The drawer and its scrim need only outrank `.platform`
(the content), not `.rail` — so the rail keeps its existing `z-index: 2`
unchanged, and `SettingsButton`'s popover keeps working with no change
to *its* `z-index` either. Only the popover's *anchoring* needed to
change (below).

Verified by `document.elementFromPoint` probes with the drawer open at
390px, not by inspection: the top bar returns `TOPBAR` at both its left
and right edges; the drawer interior returns `DRAWER` down to a
`<span>` nested inside the category tree, proving hit-testing reaches
through rather than being trapped by a new stacking context; the
content area returns `SCRIM`. With the settings popover also open, its
own centre point returns `POPOVER` even at coordinates that
geometrically overlap the drawer — confirming the rail's `z-index: 2`
still wins there, unchanged.

**Phase 0's prototype found a bug that had nothing to do with any of the
above.** `SentenceFolderTree` — the Generate page's sidebar content —
renders its own `ConfirmDialog` (the folder-delete confirmation) from
*inside* the sidebar slot, not, like the top-level guarded-navigation
one in `App.jsx`, outside `.shell`. `ConfirmDialog` declares
`position: fixed; inset: 0; z-index: 10`, and the stacking map above
says anything needing to cover both the rail and the sidebar has to live
outside `.shell` — which the `App.jsx` instance does, and the
`SentenceFolderTree` instance silently did not. Measured on `main`
*before this epic touched anything*: with that dialog open at 1440px,
`elementFromPoint(32, 450)` — a point over the icon rail — returned the
rail, not the dialog. The rail's view buttons stayed clickable
underneath what should have been a modal.

This predates the epic and would have gotten strictly worse under it: a
transformed ancestor becomes the containing block for
`position: fixed` descendants, and a drawer needs a transform (even
`translateX(0)` at rest triggers this). Prototyped at 390px before the
fix, the "modal" backdrop measured 319×788 rather than the viewport's
390×844 — clipped to the drawer's own bounds by the drawer's
`overflow-y: auto`. The fix was to portal `ConfirmDialog` to
`document.body` inside the component itself, rather than at either call
site, so the fix covers both instances and the guarantee stops depending
on where a future caller happens to render it. Verified after the fix:
the backdrop measures the full viewport and wins the hit test over the
top bar, the settings gear, the drawer, and the content, in that order.

### The settings popover needed its anchoring changed, not its stacking

`SettingsButton`'s popover is positioned `right of the rail, bottom-
aligned` — a rule that describes a *vertical* rail. In the horizontal
bar the identical rule placed the panel at `y = -373` (above the
viewport) and overflowing the right edge. This was the one place the
epic touched something inside `.rail`'s own stacking context, and it
was anchoring only: `top: calc(100% + 10px); right: 0` below the
breakpoint, `z-index: 20` unchanged. `margin-top: auto` (the desktop
rule that pins the gear to the bottom of a column) becomes
`margin-left: auto` (pinning it to the end of a row) for the same
reason.

A later adjustment moved the brand mark into the same bar, at its far
right — after which the gear was no longer the rightmost thing in the
bar, and right-aligning the popover *to the gear* left it floating over
100px short of the screen edge. The popover's anchor was changed again,
from the gear to the bar itself (`.wrap { position: static }` below the
breakpoint, letting `.rail`'s own `position: sticky` become the
containing block), with its right edge pinned to the bar's own
`--topbar-pad-right` custom property rather than to any one control
inside it. The stacking did not change a second time either — `.rail`
still owns the `z-index: 2` context the popover's `z-index: 20` lives
inside.

### Search and the brand mark move into the top bar, and nowhere else, below the breakpoint

Search lives in the sidebar on desktop. Once the sidebar became a
drawer, closed by default, that would have put the app's one
cross-content-line control two taps away from everywhere —
`searchIndex` matches kanji, vocab and grammar at once and matches
romaji regardless of the display preference, so it is not a per-line
control the way the category tree is. It moves to the bar, collapsed to
a 44px icon that expands to overlay the bar (not push inline — see
measurement below) on tap, above the breakpoint only.

The brand mark (`logo.svg`, 969×257) has the same problem for a
different reason: it lives at the top of the sidebar, so below the
breakpoint it would be inside a closed drawer, and the app would have no
visible identity on first load at all. It moves to the far right of the
same bar, sized down to 22px tall (from the sidebar's 60px) since its
3.77:1 aspect ratio makes height the binding constraint — 60px tall
wants 226px wide, which a 375px bar carrying five 44px controls cannot
give.

**Both follow the same rendering rule as each other and as the rest of
this epic: one instance, rendered into whichever slot is current, never
both.** `App.jsx` decides via the same `isNarrow` flag `useMediaQuery`
already provides for the drawer. Rendering either one twice and hiding
one copy with CSS was available and was declined for the same reason the
WIP branch's duplicate `IconRail` was declined in the prior section — it
would put a duplicate node in the accessibility tree.

The 200px minimum width for the expanded search field, and why it
overlays rather than expands inline, is measured against the longest
realistic romaji query rather than picked by feel: at the field's actual
13px body font with its 12px padding and 1px border per side (26px of
chrome), `yoroshikuonegaishimasu` — epic 009's own worked example for
よろしくおねがいします — needs 174px. Verified live in the running app
rather than only calculated: typed into the expanded field at 375px, it
renders at exactly 297px of `scrollWidth` against 297px of
`clientWidth` — filling the field with no horizontal scroll — and the
search opens the drawer to show よろしくお願いします as the top result. A
literal ~50px field, which is what a purely visual read of "compact
search icon" might produce, would hold four characters and would break
the feature this promotion exists to serve.

**Two behaviours fell out of building this that the originating issue
did not specify, both flagged rather than decided silently:**

- **Search results still render inside the sidebar/drawer**, which is
  now closed by default. A non-empty query opens the drawer, since a
  query with nowhere to show its results would be useless. It does not
  re-close the drawer when the query is cleared, for the same reason
  selecting a category doesn't — the exit is the arrow, deliberately,
  not an implicit side effect of every other interaction.
- **This exposed a genuine bug in the drawer's own focus handling.**
  The drawer moves focus to its close arrow whenever it opens, so the
  next Tab stays inside the modal surface — except that the *search*
  field opening the drawer as a side effect of typing would, under that
  same rule, yank the caret out of the search field after the first
  character. Fixed by checking whether the currently focused element is
  a text input before relocating focus; if so, focus is left exactly
  where it was. Verified: after typing the worst-case query above, the
  caret sits at position 22 in the search field, not on the close
  arrow.

### Touch targets and the hover audit

Fifteen CSS modules used `:hover` at the point this epic started. Read
individually rather than pattern-matched, thirteen were decoration — a
wash or border shift on a control that already reads as interactive
without it — and cost nothing on a touch device. Two were carrying
information rather than decoration, and both needed a fix under
`@media (hover: none)` / `@media (hover: hover)` rather than the width
breakpoint, since a tap target is a property of the *pointer*, not the
viewport — a touch laptop at 1400px has exactly the same problem a
narrow phone does, and a mouse-driven window narrowed for no reason has
none.

**The more serious of the two was not the one flagged going in.**
`SentenceFolderTree`'s rename and delete controls were
`opacity: 0`, revealed only by `.folderHead:hover`. On a touch device
that is not a missing polish cue — it is the entire visibility of the
control, with no hover event to ever bring it back. They are visible by
default now, hidden again only under `(hover: hover)` paired with
`:focus-within` so keyboard users on a mouse-driven machine can still
reveal them by tabbing.

The one that *was* flagged, `SentenceListItem`'s delete button, loses
its only tell that it's destructive (a `:hover` border shift to `--bad`)
with no hover to trigger it; under `(hover: none)` the resting state now
carries that border directly.

Every interactive dot under 44px — the flashcard ✓ (20px), the sentence
row's ✓ and delete (26px), the folder tree's rename/delete (20px) — gets
its target expanded via a transparent pseudo-element under
`@media (pointer: coarse)`, without changing the visible control's own
size. The straightforward version of this — a symmetric inset around
the dot — does not work for the flashcard case specifically: the flip
uses `transform-style: preserve-3d`, and hit-testing does not extend
past a face's own edge inside that context, so a pseudo-element hanging
outside the face never receives a tap. Measured, the symmetric version
came out to 32px, not 44. The fix keeps the entire expanded area inside
the face by biasing the inset toward the dot's actual corner (`-16px
-8px -8px -16px`, matching where the dot sits relative to the face's
edges) rather than expanding it symmetrically outward.

The folder tree's rename/delete pair could not reach 44px in either
direction without overlapping its neighbour or the row's other content —
measured effective target there is 31×43, the honest ceiling for a
320px drawer row carrying an icon, a name, a count and two controls, not
a compromise passed off as the floor.

## Consequences

- Content box at 375px went from 0px to 335px (Study) and from a 0px
  page wrapper to 335px (Generate) — the two numbers the originating
  issue measured as the worst cases.
- Desktop (≥1025px) is verified identical to the pre-epic baseline after
  every commit in the epic, not merely assumed: rail/sidebar/main
  geometry, grid column counts and widths, tile dimensions, and which
  slot search and the brand render into were all re-measured against a
  recorded baseline each time.
- `ConfirmDialog` now always portals to `document.body`. Any future
  caller inherits the fix automatically rather than having to remember
  to render it outside `.shell`.
- The breakpoint value exists in five places with no shared source of
  truth (see above) — a real cost, accepted because introducing a build
  step or a CSS-custom-media polyfill for one number was judged worse
  than the duplication, but worth revisiting if a sixth site ever needs
  it.
- The flashcard tile's `minmax(180px, 260px)` cap (added the same epic,
  documented in the code rather than here since it is CSS-only) is
  scoped to the narrow layout specifically. Applying it above the
  breakpoint as well was tried and measured: it changes the desktop grid
  from four 226px columns to three 260px ones, because CSS Grid's
  `auto-fill` counts repetitions from the track's *maximum* sizing
  function once it stops being `1fr`. That is a regression on the
  cap's own justification — it moves the tile further from its 210px
  design width, not closer — so the cap only applies where the
  stretching it exists to fix actually happens.
- Two known gaps, stated rather than hidden: the CMS upload card's
  narrow-width behaviour was verified by reading its stylesheet only
  (no fixed or minimum widths present) rather than by exercising it
  live, since `VITE_ADMIN_WRITES_ENABLED` was unset in the environment
  this epic was built in; and every verification in this epic was done
  by measurement — bounding rects, computed styles,
  `document.elementFromPoint` — rather than by screenshot, because the
  preview environment used was not compositing frames during
  development. Both are worth a manual pass before treating the epic as
  fully closed.
