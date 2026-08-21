# Epic 010 — Long-Content Layout: Flip Lists for Grammar & Long Vocab

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#116](https://github.com/phill-tam/sento/issues/116)

---

## 1. Problem Statement

Long content doesn't fit a 180px flip tile. Grammar patterns are
phrases, not words, and a handful of vocab greetings run nearly as
long — both wrap badly or spill past the card. This epic gives those
categories a list layout whose rows still flip, vertically instead of
horizontally.

**Why this is its own epic, not part of epic 009 (Romaji).** Epic 009
exposed the problem but didn't create it: `.jp` had carried
`overflow-wrap: break-word` since long before romaji existed,
precisely because grammar patterns don't fit. Epic 009's
`white-space: nowrap` stopgap on `.romaji` was explicitly labelled as
temporary, and this epic is what removes it. The change is layout
architecture in `FlashcardGrid`/`FlashcardCard` — epic 003's
components — and the display-mode concept it introduces applies to any
long content added later, not just romaji.

**The problem, measured.** Card inner width is 182px (210px minus
padding), romaji rendered at 13px italic. Grammar: 5 patterns overflow
across 3 categories — `sentence_structure` (2/7, worst 303px),
`existence_location` (2/4, worst 310px), `plain_form` (1/3, 197px).
Vocab: `greetings` is the one at-risk category — its romaji technically
fits (widest `yoroshikuonegaishimasu`, 140px of 182px) but its Japanese
(よろしくおねがいします, ~253px at 23px) wraps and cramps the tile
regardless of romaji.

---

## 2. Architecture Overview

**One component with a `layout` prop, not a second component.**
`FlashcardCard` already carried selection mode, mastery marking, flip
sounds, the category tag, romaji visibility, and Kanji's 音/訓 split — a
parallel list component would duplicate every one of those and drift
from it. `layout="grid" | "list"` swaps the CSS class; every branch,
handler, and prop stays identical between the two. Direct precedent:
`ToggleSwitch`'s `orientation` prop (epic 007/008), scoped under one
class, inert for every default caller.

**Which categories get a list is a table, not a measurement.**
`utils/categoryLayout.js` holds an explicit category → layout allowlist
rather than measuring rendered text at render time (considered and
rejected — self-maintaining, but risks layout shift and is far harder
to reason about than a table someone can read):

| line | default | exceptions |
|---|---|---|
| grammar | list | `particles`, `counters`, `conditionals` → grid |
| vocab | grid | `greetings` → list |
| kanji | grid | none |

The three grammar exceptions are short, fixed-form entries that will
never outgrow a tile — this puts 14 of 17 grammar categories on list.
An unknown line or missing category falls back to grid; an *unlisted*
category falls back to its line's own default, so a new grammar
category doesn't silently get tiles it will overflow. `StudyPage`'s
existing `activeCategoryId` was threaded into `FlashcardGrid` for this
lookup — it hadn't been passed down before this epic.

Accepted cost: the map needs updating by hand when categories are
added, and a long pattern uploaded into `particles` would overflow
until someone notices. That's the deliberate trade for predictability
— recorded in ADR 016 so a future measurement-based "improvement"
doesn't silently reopen the layout-shift problem this rejected.

**Vertical flip via grid-stacked faces, proven before anything else was
built.** The axis swap itself (`rotateX(180deg)` instead of
`rotateY(180deg)`) is trivial. The real problem was height: the
original card is a fixed `height: 200px` with `.face { position:
absolute }`, so both faces are identical size by construction. A list
row is variable-height, and a differing front (pattern + reading +
romaji) and back (meaning + example) would visibly resize the row
mid-flip. The fix: stop absolutely positioning the faces and stack
them in one grid cell instead —

```css
.inner { display: grid; }
.face  { grid-area: 1 / 1; }   /* both in flow, same cell */
```

Both faces then contribute to height, the taller wins, the row stays
stable through the flip, and `preserve-3d` still applies. This was
prototyped *first*, before the allowlist or the component API were
built, specifically because it was the one piece that could invalidate
the whole design if it fought `backface-visibility` or `preserve-3d`.
It held: row heights stayed constant to the pixel through a full 500ms
flip (sampled every 45ms), `backface-visibility` still hid the reverse
face with both faces in flow, and hit testing returned exactly one face
per state.

**List mode's back face lays out horizontally, not stacked.** Stacking
meaning over a four-line example is what a 182px tile has to do; across
a full-width row it produced 166px rows with the front face rattling
around in the empty half. Side by side, rows run 78–93px — the seven
`sentence_structure` patterns went from 1162px of total height to 593px.

**The selection pulse is inverted for rows.** The grid marks a
selectable card with a box-shadow *outside* it, which can't work
between adjacent list rows since each neighbour's opaque face paints
over it. Same animation and role tokens, turned into an inset ring
(`9999px` inset spread standing in for the wash) instead.

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
| `components/study/FlashcardCard.jsx` + `.module.css` | `layout` prop; grid-stacked faces; `.list` variant with horizontal back-face layout and inset-ring selection pulse |
| `components/study/FlashcardGrid.jsx` | Renders a `<ul>` wrapper in list mode; threads `activeCategoryId` down for the layout lookup |
| `utils/categoryLayout.js` | The per-category layout allowlist |
| `components/generator/SentenceListItem.jsx` + `.module.css` | Phase 4 — gained the same grid-stacked-faces flip mechanic, duplicated rather than shared (§8) |

---

## 6. Decisions

Five, all recorded in ADR 016 (`docs/adr/016-per-category-layout-and-flip-height.md`):

1. **One component with a `layout` prop** — not a second component (§2).
2. **Per-category allowlist, not a length heuristic** — the table above, with its accepted maintenance cost recorded explicitly.
3. **Grid-stacked faces over absolutely-positioned ones** — the prototype-first validation that proved it (§2).
4. **Borrow `SentenceListItem`'s visual rhythm** (`.item`'s `14px 16px` padding and row spacing) rather than building a new look — `SentenceListItem` itself stayed unmodified through phases 0–3, revisited in phase 4.
5. **Two decisions phases 1–3 made that weren't scoped up front**, both matter for phase 4: the horizontal back-face layout, and the inverted (inset-ring) selection pulse.

---

## 7. Build Plan

| phase | what | commit / PR |
|---|---|---|
| 0 | Prove the flip — prototype only, no shipped code | — |
| 1 | The layout variant; remove epic 009's `white-space: nowrap` stopgap | `38620c2` |
| 2 | Category routing — `utils/categoryLayout.js`, `activeCategoryId` threaded through | `6ceb37a` |
| 3 | Polish — both themes via role tokens only (ADR 013), responsive at 1280/760/375px, `prefers-reduced-motion` | `5ad2034` |
| 4 | The generated-sentence list | `aeabd52`, `f558bfd` — [#120](https://github.com/phill-tam/sento/pull/120), merged |

Phases 0–3 merged in [#119](https://github.com/phill-tam/sento/pull/119).

---

## 8. What Actually Shipped, and Where It Differed

**Phase 4's face split.** Front: `jp_text` → `romaji`. Back: `reading`
(kana) → `romaji` → `meaning_en`. Romaji appears on *both* faces,
directly under the Japanese on each — the reading aid for the Japanese
on the front, the Latin partner to the kana on the back.

**Romaji stayed conditional, not just preference-gated.**
`sentence.romaji` is `null` for anything saved before epic 009 phase 2
and can never be backfilled, so both faces had to tolerate its absence
— 13 of the 14 sentences in the local database were in that state at
ship time.

**Folder-select and delete stayed front-only.** They're browsing
actions and the back is the answer face; putting a `<select>` on dark
chrome would have needed a second set of on-chrome form styles for no
real benefit. The ✓ is on both faces, so a flipped row stays
selectable. Every control stops the row's own flip gesture on both
click *and* keydown, since the row answers Space and Space is also how
a native `<select>` opens.

**Duplicated, not shared.** Whether to extract the shared flip mechanic
was an open question going in. Resolved as duplicate: `composes:`
appears nowhere else in this codebase, and the two blocks aren't
actually the same code — `FlashcardCard`'s list CSS is largely
*undoing* its own 200px tile, while `SentenceListItem` has no tile to
undo in the first place. Both modules carry the grid-stacked-faces
rules independently; changing the flip mechanic means changing both.
If a third flipping list appears, this calculus is worth revisiting.

**Selection pulse stayed static for the sentence list**, not pulsing —
this list never had the flashcards' idle pulse, and phase 4 wasn't
scoped to add one.

---

## 9. Open Questions

- **`QuizCard` still doesn't handle long grammar prompts.** Raised and
  left open in phases 1–3, still open after phase 4 — out of scope for
  this epic both times.
- **The open risk this epic accepted deliberately:** epic 005 chose
  "list display, not grid" for the saved-sentence list on purpose, and
  that list doubles as a management surface (relocate, delete). Hiding
  `meaning_en` behind a flip makes it a study surface first and a
  management surface second. That's the intended change from phase 4,
  but it's the first thing to look at if the result feels wrong in
  practice.
