# ADR 010 — Two-Tier Sidebar: Icon Rail + Collapsible Content Sidebar

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

Epic 001 established `AppShell` as a single sidebar-rail + main-panel
layout, with all navigation happening through the content sidebar's
`CategoryTree` (ADR 004 — sidebar-only navigation, no top-level nav bar).
That assumption held as long as there was only one top-level view
(Study). Epic 002 introduces a second top-level view (Manage Content),
and the existing sidebar has no mechanism for switching between top-level
views — `CategoryTree` navigates *within* a view (categories/items), not
*between* views.

This is a genuine architectural fork against epic 001's shared
`AppShell` component, not an additive change — it required modifying
`AppShell.jsx` and `AppShell.module.css` directly, files every other page
in the app already depends on.

## Decision

A second, narrower sidebar — `IconRail`, a 64px icon-only vertical
navigation rail — sits to the left of the existing content sidebar.
`AppShell` gained a new `rail` slot (optional, rendered before the
existing `sidebar` slot; `undefined` when absent, so existing callers are
unaffected) and a `sidebarCollapsed` prop that toggles a CSS class rather
than unmounting the sidebar, so the collapse can animate.

Interaction model: pressing the rail icon for the *currently active* view
collapses the content sidebar. Pressing a *different* view's icon
switches views and re-expands the sidebar if it was collapsed. `view`
(`"study" | "cms"`) and `sidebarCollapsed` both live as local `App.jsx`
state — the same "local state, not a router yet" approach epic 001 used
for `ModeToggle`'s Generator access.

## Consequences

**Positive:**
- `AppShell` remains the single shared layout component every page
  renders inside (epic 001 ADR 002 preserved) — the fork extends it
  rather than replacing it or forcing pages to own their own top-level
  layout.
- Backward compatible: any caller not passing `rail` renders identically
  to before this epic.
- Collapsing (not unmounting) the content sidebar means its internal
  state (search input, open tree nodes) isn't lost when a user toggles it
  closed and back open.

**Negative:**
- `AppShell`, a file every page depends on, is no longer purely epic
  001's — it now carries epic 002's interaction logic too, meaning future
  epics touching top-level navigation will likely need to modify it again
  rather than building independently.
- Real routing is still deferred — `view` state lives in `App.jsx` as a
  string, not a URL, so there's no deep-linking to the CMS view, no
  browser back-button support for view switches, and no way to bookmark
  "already on the Manage Content view."
- A gap surfaced during implementation, deliberately left open rather than
  silently resolved: the content sidebar still renders the *study*
  `CategoryTree` (currently empty) even while `view === "cms"`, since
  `ContentManagementPage` has its own internal tree. Whether the sidebar
  should auto-collapse when entering the CMS view, or show something
  else entirely, is unresolved and should be decided as a follow-up, not
  assumed by this ADR.

## Alternatives Considered

**Single-link stopgap** (a plain link/button inside the existing sidebar
content, no new rail). Rejected — epic 001's original assumption was that
a top-level nav bar would eventually host CMS access; once that nav bar
was explicitly dropped (epic 001 ADR 004), a single buried link has no
natural home and doesn't scale past two views.

**Full client-side router now.** Rejected — no routing library exists in
the project yet, and introducing one specifically to support a
two-view switch is disproportionate to the actual need; deferred to a
future epic once more pages exist to justify it (tracked in both epic
001's and epic 002's Planned Upgrades).

**Rail without collapse behavior** (icon rail added, but the content
sidebar always stays expanded regardless of active view). Rejected —
would mean showing the empty study `CategoryTree` alongside the CMS's own
tree simultaneously, which is redundant screen space for no benefit; the
collapse mechanism directly addresses that.