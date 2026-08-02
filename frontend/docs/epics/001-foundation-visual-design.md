# Epic 001 — Foundation: Visual Design System & App Shell

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only

---

## 1. Problem Statement

Every screen built prior to this epic used ad hoc inline colors and
system fonts with no shared design language. This epic establishes
Sento's actual design system — a teal/gold/cream palette, a
serif-for-Japanese / sans-for-body font pairing, and a sidebar-tree +
main-panel application shell — as reusable, versioned code rather than
a one-off styling pass.

This is the first epic of the project. It delivers *style and
structure* only — palette, typography, app shell, a generic sidebar
tree — with no content-line-specific logic (Kanji, Vocabulary,
Grammar) and no feature logic (upload, flashcards, quiz, generation).
Every later epic builds inside what this one establishes.

---

## 2. Architecture Overview

**CSS custom properties, not CSS-in-JS or Tailwind.** The palette and
typography are defined once as `:root` custom properties in a
dedicated `tokens.css`, matching the project's plain-CSS-modules
convention. Every component consumes tokens via `var(--token-name)`
with no build step or extra dependency required. See ADR 001.

**Font pairing carries real meaning.** `--font-display` (a serif
suited to Japanese typography) is used specifically for Japanese text;
`--font-body` (sans-serif) is used for UI chrome and English labels.
Every component rendering Japanese text uses `--font-display`
deliberately, not by accident of inheritance.

**App shell is a single shared layout component.** `AppShell` (sidebar
rail + main panel) is built once and reused by every content-line
page, the CMS, Quiz Mode, and the Sentence Generator — none of them
own their own top-level layout. See ADR 002. `AppShell` is designed to
accept additional structural slots as real navigation needs emerge,
rather than being rebuilt per epic — its first extension (an
icon-only navigation rail alongside the existing sidebar) is already
planned as part of the epic that follows this one.

**Sidebar tree stays fully generic.** `CategoryTree` ports a reusable
folder/item hierarchy with no knowledge of Kanji, Vocabulary, or
Grammar specifically — each content-line epic supplies its own data.
Progress badges use generic `count`/`total`/`complete` props rather
than mastery-specific terminology, since no mastery-tracking feature
is defined yet. See ADR 003.

**Navigation is sidebar-only.** All section-switching happens through
`CategoryTree`. Cross-section access to the Sentence Generator is
handled by a shared `ModeToggle` component — rendered per content-line
page, with a visually distinct animated treatment marking it as an
AI-powered action — exposing a callback for navigation rather than a
hardcoded route, since no client-side router exists yet. A top-level
navigation bar was evaluated and deliberately not built. See ADR 004.

**Feature flags are named per-epic.** This epic ships behind
`FEATURE_FOUNDATION_SHELL`, establishing the naming convention every
later epic's flag follows. See ADR 005.

**No backend endpoints in this epic.** Pure frontend shell and
styling.

---

## 3. Data Model

None.

---

## 4. API Surface

None.

---

## 5. Frontend Components

| Component | Purpose |
|---|---|
| `styles/tokens.css` | Shared palette and font custom properties |
| `components/layouts/AppShell.jsx` | Sidebar rail + main panel structural wrapper |
| `components/layouts/ModeToggle.jsx` | Study/Quiz view toggle + Sentence Generator access, shared across content-line pages |
| `components/layouts/CategoryTree.jsx` | Generic, fully controlled category → item sidebar tree |

---

## 6. Decisions

Five architectural decisions were made in this epic, each recorded as
a standalone ADR:

- **ADR 001** — Design tokens as CSS custom properties
- **ADR 002** — `AppShell` as a single shared layout component
- **ADR 003** — `CategoryTree`'s generic prop contract
- **ADR 004** — Sidebar-only navigation, top-level nav bar dropped
- **ADR 005** — Feature flags follow per-epic naming convention

---

## 7. Planned Upgrades (future phases)

- **Consolidate `CategoryTree` with the Sentence Generator's item
  sidebar**, once both exist and the overlap is proven safe to merge.
- **Theming beyond one palette**, if ever wanted — low-cost later
  given the custom-property approach, not attempted now.
- **Real client-side routing**, once more than one page exists —
  `ModeToggle`'s Generator access is currently a callback with no
  navigation behind it.

---

## 8. Open Questions

Both questions raised at the close of this epic have since been
resolved during planning for the epic that follows:

- **Resolved — CMS entry point.** Epic 002's content-management entry
  point was originally scoped assuming a top-level navigation bar
  would host it. That assumption no longer held once the top-level
  nav bar was dropped (ADR 004). The resolution is a second, narrower
  navigation rail alongside the existing sidebar, with the existing
  sidebar becoming collapsible — documented as part of epic 002.
- **Resolved — mastery/progress tracking timing.** Rather than being
  deferred indefinitely, mastery/progress tracking will be formally
  defined alongside epic 002 rather than left open. `CategoryTree`'s
  generic contract (ADR 003) remains unaffected either way.
