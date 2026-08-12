# 016 — Per-category flashcard layout, and the flip-height mechanic behind it

**Status:** Accepted
**Related:** [003 — CategoryTree's generic prop contract](003-categorytree-generic-prop-contract.md), [013 — Semantic role token layer](013-semantic-role-token-layer.md), [015 — Romaji computed at read time, except grammar's two sentence-shaped fields](015-romaji-computed-except-grammar.md)

## Context

The flashcard grid renders every content item as a 210px tile with 182px
of usable inner width. That fits a kanji glyph and it fits a vocab word.
It does not fit a grammar pattern, because a grammar pattern is a
phrase: five of them across three categories render wider than the tile,
the worst being `~ no ue/shita/naka/mae/ushiro/tonari/chikaku ni` at
310px. One vocab category is in the same position for a different
reason — `greetings` holds よろしくおねがいします, roughly 253px of Japanese
at the front face's 23px display size.

This predates romaji. `.jp` has carried `overflow-wrap: break-word`
since long before epic 009, precisely because patterns don't fit. What
009 added was a second long line under the first, and a
`white-space: nowrap` on `.romaji` that let it run past the card edge
rather than wrap and shove the rest of the face out — labelled in the
stylesheet at the time as a stopgap for a later branch. This is that
branch (#116), and removing the stopgap is part of it.

Three decisions had to be made: what the alternative layout *is*, how a
category gets routed to it, and — the one with real technical risk — how
a variable-height row can flip at all.

## Decision

### One component with a `layout` prop

`FlashcardCard` takes `layout="grid" | "list"`, which swaps a single
class. Every branch inside it, both handlers, the ✓ button's two
meanings under selection mode, the mastery badge, the flip sounds, the
kanji 音/訓 split and the romaji visibility gate are shared verbatim.
`FlashcardGrid` correspondingly wraps the same cards in a `<ul>` of
rows instead of a tile grid.

This follows `ToggleSwitch`'s `orientation`: the variant is scoped under
one class and inert for every caller that doesn't ask for it. The
alternative — a parallel `FlashcardListItem` — would have had to
reimplement selection mode, mastery, sounds and the category tag on day
one and then track every later change to them.

`SentenceListItem` was considered as a base and rejected. At the time it
showed all four of its lines at once with no flip, and it carries
folder-select and delete controls, so it was not a drop-in. Only its
visual rhythm (14px/16px padding) was borrowed, and the component itself
was left alone. **That is no longer the current state** — it grew a flip
of its own in phase 4; see the addendum at the end of this record.

### An explicit per-category table, not a measurement heuristic

`utils/categoryLayout.js` holds a per-line default plus named
exceptions:

| line | default | exceptions |
|---|---|---|
| grammar | **list** | `particles`, `counters`, `conditionals` → grid |
| vocab | grid | `greetings` → **list** |
| kanji | grid | none |

Measuring the rendered text and choosing a layout from it was considered
first, because it self-maintains and would catch a long pattern uploaded
into a short category. It was rejected on two grounds: it can only run
after a first paint, so the layout it picks arrives as a visible shift;
and it removes any readable answer to "why is this category a list?"
A table someone can open and check is easier to reason about than a
threshold that has to be reverse-engineered from behaviour.

**This is a deliberate trade, not an oversight.** The accepted cost is
that the table needs updating when a category is added, and that a long
pattern uploaded into `particles` will overflow until someone notices.
Anyone tempted to replace this with a measurement should know that the
alternative was weighed and declined, and should be replacing it for a
reason that isn't "it would maintain itself".

Two different fallbacks, on purpose:

- No category selected, or a **line** the table doesn't know → grid.
  That is the layout everything had before this epic.
- A **category** the table doesn't list, within a line it does →
  that line's default. This matters in one direction only: a grammar
  category added later is long until proven otherwise, and quietly
  handing it tiles would reintroduce the exact overflow this epic
  exists to fix.

### The faces share one grid cell — they are not absolutely positioned

This was the open technical risk, and it was prototyped before anything
else was written.

A tile can absolutely position both faces over a fixed `height: 200px`
because they are the same size by construction. A row cannot: its height
comes from its content, and its two faces are rarely the same height —
a front carries pattern + reading + romaji, a back carries meaning +
example. With `position: absolute` faces, neither contributes to the
row's height, so the row would have had to resize as it flipped.

Instead, in list mode:

```css
.inner { display: grid; }
.face  { grid-area: 1 / 1; }   /* both in flow, same cell */
```

Both faces are in flow and stretch to one cell. Consequences, all of
them wanted:

- the taller face sizes the row, and the shorter is centred in it
- both faces resolve to the same box, so `rotateX(180deg)` pivots on a
  shared axis rather than two different ones
- `backface-visibility: hidden` still hides the reverse face — being in
  flow does not change that
- `transform-style: preserve-3d` still applies

Verified in the running app: row heights are constant to the pixel
through a full 500ms flip, sampled every 45ms, and hit testing returns
exactly one face at a time in both states.

### Two consequences worth recording

**The selection pulse is inverted for rows.** The grid marks a
selectable card with an animated box-shadow *outside* it. Between
adjacent list rows that cannot work — each neighbour's opaque face
paints over it. The list uses the same animation and the same role
tokens turned inward: an inset ring, with a `9999px` inset spread
standing in for a background wash so the selected state tints without
either face's gradient being touched.

**The category tag is hidden in list mode.** Every row in a list shares
one category, so the tag repeats the page heading on every line. It
stays in the markup for the grid, where the same card can appear in
mixed contexts.

## Consequences

- Grammar's long patterns and `greetings` render without overflow, and
  `.romaji`'s `white-space: nowrap` stopgap from epic 009 is gone —
  romaji wraps normally in both layouts again.
- 14 of 17 grammar categories now render as lists.
- Adding a content category means considering this table. Adding a
  *grammar* category means it gets a list unless it is added as an
  exception.
- The list is denser than it first appears: the back face lays out
  horizontally in list mode. Stacking meaning over a four-line example
  is what a 182px tile has to do; across a full row it produced 166px
  rows with the front face rattling around in the empty half. Side by
  side, rows are 78–93px.
- Nothing here is theme-aware by itself. Both faces resolve entirely
  through role tokens, per ADR 013.
- `prefers-reduced-motion` is now honoured for the flip and for both
  selection pulses, each pinned to its resting frame rather than
  removed, since the pulse is the only affordance marking selection
  mode. This is *not* the reduced-motion gap noted on #90, which
  concerns audio autoplay and remains open.
- Untouched: the app still has no breakpoints, and between roughly
  600px and 1000px the sidebar stays open and squeezes the content
  panel badly. That is the shell's problem and affects the grid
  identically; inventing a responsive system for one component was out
  of scope here.

## Addendum — the saved-sentence list (phase 4)

The original write-up said `SentenceListItem` was left unmodified and
only its visual rhythm borrowed. That held for phases 0–3; phase 4 is
the revisit it flagged as possible. Three further decisions came out of
it, none of which change anything above.

**The row flips, and the meaning moves to the back.** A saved sentence
is study content — it feeds the global quiz pool alongside kanji, vocab
and grammar — and its list was the one surface that showed the answer
before you had tried to recall it. Front is `jp_text` plus romaji; back
is `reading`, romaji again, and `meaning_en`. Romaji appears on both
faces because it plays a different part on each: reading aid for the
Japanese on the front, and the Latin partner to the kana on the back. It
stays conditional rather than merely preference-gated, since `romaji` is
null on anything saved before epic 009 phase 2 and there is nothing to
backfill it from.

This does soften epic 5's posture. That epic chose "list display, not
grid" for this surface, and the list doubles as a management surface —
relocate and delete. Putting the meaning behind a flip makes it a study
surface first and a management one second. That is the intended change,
and it is the first thing to look at if the result ever feels wrong.

**The controls split across the faces rather than being duplicated onto
both.** The ✓ is on both, as `FlashcardCard`'s mark button is, so a
flipped row can still be picked for a quiz. Relocate and delete are
front-only: they are browsing actions, the back is the answer you
flipped to check, and a `<select>` on the dark face would have needed a
second set of on-chrome form styles to say nothing new. Every control
stops the row gesture — click *and* keydown, since the row answers Space
and Space is also how a `<select>` opens.

**The mechanic is re-stated, not shared.** `SentenceListItem.module.css`
repeats the grid-stacked-faces rules rather than importing them.
CSS Modules cannot share a rule, and the two blocks are not the same
code: `FlashcardCard`'s `.list` variant is largely *undoing* the 200px
tile it starts from, while this component has no tile to undo and states
the mechanic positively. `composes:` was the alternative, and was
declined — it appears nowhere else in the codebase, and introducing the
concept to save roughly ten lines is the worse trade. If a third
flipping list ever appears, that calculus changes.

One thing deliberately *not* carried across: the flashcards' idle
selection pulse. This list has never had one, and phase 4 was not the
place to give it one — selected is a static inset ring plus wash, which
is the old background-wash treatment ported onto an opaque face.
