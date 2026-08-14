# Sento

A JLPT N5 Japanese language learning platform — vocabulary, kanji, and
grammar study lines, a mixed-type quiz mode, and an AI sentence
generator that produces practice sentences (with reading and English
meaning) from user-selected content items. Every study item also carries
romaji, shown by default and searchable, so the app is usable without a
Japanese keyboard.

- **Frontend:** React 19 + Vite, plain CSS Modules
- **Backend:** FastAPI + uv + Alembic + PostgreSQL (local) / Supabase (staging/prod)

---

## Project Status

| Epic | Scope | Status |
|---|---|---|
| 001 — Foundation | Visual design system & app shell (frontend) | Shipped |
| 002 — Content Management | CSV upload + inventory tree (backend + frontend) | Shipped — writes are opt-in, see [Admin writes](#admin-writes) |
| 003 — Flashcards | Flip-card grid + cross-line search (frontend) | Shipped |
| 004 — Quiz Mode | Selective-recall multiple-choice quiz (frontend) | Shipped |
| 005 — Sentence Generator | AI sentence generation + folders (backend + frontend) | Shipped |
| 006 — Global Quiz | Cross-line, mixed-type quiz pool incl. saved sentences (frontend) | Shipped |
| 007 — Sound | Background music + card flip effects, per-system controls | Shipped |
| 008 — Theming | Day/night themes with a user-selectable toggle | Shipped — see [Theming](#theming) |
| 009 — Romaji | Romaji on every card, romaji search, visibility toggle | Shipped — see [Romaji](#romaji) |
| 010 — Long-content layout | Flip-list rows for grammar and long vocab | Shipped — see [Long-content layout](#long-content-layout) |
| 011 — Responsive shell | 1024px breakpoint, top bar + overlay drawer (frontend) | Shipped — see [Responsive layout](#responsive-layout) |
| 012 — Word Pairs | AI-graded English sentence writing, a second quiz type (backend + frontend) | Shipped — see [Word Pairs](#word-pairs) |

Epics 001, 002, 009 and 012 have write-ups in `docs/epics/`. The rest
exist as shipped code, the GitHub issues that track them, and `epic N`
comments in the source — treat those as more current than `docs/` when
the two disagree. Architecture decisions are recorded as ADRs in
`docs/adr/`, currently numbered up to 018.

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 16+ (for local development and testing)
- [uv](https://docs.astral.sh/uv/) for Python dependency management

---

## Installation

### 1. Clone the repository

```bash
git clone <repo-url>
cd sento
```

### 2. Backend setup

```bash
cd backend

# Install dependencies
uv sync

# Set up environment variables
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at your local PostgreSQL
instance (see [Environment Variables](#environment-variables) below).

```bash
# Run database migrations
uv run alembic upgrade head

# Seed initial N5 content (Kanji, Vocabulary, Grammar) — without this,
# the database is empty and GET /kanji, /vocab, /grammar will return
# empty lists even though the tables and API are working correctly
uv run python -m app.seed_data.seed_content

# Start the dev server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

No `frontend/.env` is required — the app runs fully configured out of
the box. Copy `.env.example` only if you need to point at a non-default
backend URL or turn on the content-management UI (see
[Admin writes](#admin-writes)).

---

## Development

### Backend (`backend/`)

```bash
uv run ruff check .                          # lint (CI-enforced)
uv run pytest                                # tests (none exist yet)
uv run alembic revision --autogenerate -m "..."   # new migration after a model change
```

### Frontend (`frontend/`)

```bash
npm run build   # production build (CI-enforced)
npm run lint    # oxlint (CI-enforced; config: .oxlintrc.json)
```

There is no `test` script yet. CI runs the frontend test step only if
`frontend/src/**/*.test.jsx` files exist, and the backend test step only
if `backend/tests/**` has files.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | App runtime connection. Local dev: `postgresql+psycopg://sento:sento@localhost:5432/sento_db`. Supabase: use the transaction pooler (port `6543`). |
| `MIGRATIONS_DATABASE_URL` | No | Alembic only. Leave blank for local dev — falls back to `DATABASE_URL`. Supabase: use the direct, non-pooler connection (port `5432`). |
| `ADMIN_WRITES_ENABLED` | No | Default `false`. Mounts the content **write** endpoints. See [Admin writes](#admin-writes) before enabling. |
| `ENVIRONMENT` | No | Default `development`. Selects the AI provider: `development` → Gemini, `production` → Claude. One switch for **both** AI features — sentence generation and Word Pairs answer grading ([ADR 018](docs/adr/018-ai-provider-protocol-narrowed-to-complete.md)). |
| `GEMINI_API_KEY` | If using AI features in dev | Required when `ENVIRONMENT=development`. Free-tier keys carry a per-minute quota shared by both AI features — see [Word Pairs](#word-pairs). |
| `GEMINI_MODEL` | No | Default `gemini-3.5-flash`. A plain env var read at startup — changing the model is a `.env` edit, never a code change. |
| `ANTHROPIC_API_KEY` | If using AI features in prod | Required when `ENVIRONMENT=production`. |
| `ANTHROPIC_MODEL` | No | Default `claude-sonnet-4-5`. |

### Frontend (`frontend/.env`, optional)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | No | Defaults to `http://localhost:8000`. |
| `VITE_ADMIN_WRITES_ENABLED` | No | Default `false`. Shows the content-management UI. Has no effect unless the backend also sets `ADMIN_WRITES_ENABLED`. |

---

## Admin writes

There are **no feature flags.** Every epic shipped, so the per-epic
`FEATURE_*` flags were removed — Study, Quiz and the Sentence Generator
are always on, and the app runs with no environment configuration. See
[`docs/adr/012-feature-flags-removed-admin-write-gate.md`](docs/adr/012-feature-flags-removed-admin-write-gate.md).

One switch remains, and it is access control rather than epic gating:

| Variable | Layer | Default | Gates |
|---|---|---|---|
| `ADMIN_WRITES_ENABLED` | Backend | `false` | `POST /{line}/upload`, `PATCH /{line}/{id}/status` |
| `VITE_ADMIN_WRITES_ENABLED` | Frontend | `false` | Whether the content-management UI is offered |

**The content write endpoints have no authentication.** There is no
`User` model or auth mechanism anywhere in this project, so keeping
those routes out of the OpenAPI schema is the only thing protecting
them. Do not set `ADMIN_WRITES_ENABLED` in any environment reachable by
anyone other than yourself. See
[`docs/adr/011-no-auth-feature-flag-gated-only.md`](docs/adr/011-no-auth-feature-flag-gated-only.md).

The two layers are enforced independently — the frontend variable only
decides whether the UI appears, never whether the API accepts the call.
Setting it alone gives you a page whose requests 404.

The `GET` list endpoints are always mounted, since Study fetches them on
every page load. Reading content has never needed a flag; the old
`FEATURE_CONTENT_MANAGEMENT` coupled reads and writes into one switch,
which is exactly what ADR 012 unpicked.

**Known gap:** `POST /sentences/generate` and `POST /pair-writing/grade`
are both unconditionally mounted and unauthenticated. Both spend real AI
provider quota per call, both share the same provider key per
environment, and the provider's own rate limit is the only backstop for
either — see [Word Pairs](#word-pairs) and
[ADR 018](docs/adr/018-ai-provider-protocol-narrowed-to-complete.md).

---

## Theming

The app ships a day and a night theme. Nothing to configure — the theme
is a per-browser preference in `localStorage` under `sento:theme`, with
no server involvement.

Two places change it, both wired to the same state so they can never
disagree:

- the vertical switch beside **Start** on the landing screen, so a theme
  can be picked before the app opens
- the **Theme** row in the settings popover, behind the gear at the
  bottom of the icon rail, for changing it mid-session

`sento:theme` holds `light` or `dark` and defaults to `light`, so a
first-time visitor always meets the day theme — the app deliberately
does not read `prefers-color-scheme`. Day is the palette the project was
designed around, and following the OS meant a dark-OS visitor met a
version nobody had chosen as its introduction. The cost is one click for
someone who wants night, and it persists from then on.

Two ADRs cover the implementation, and both are worth reading before
touching colours:

- [`013 — Semantic role tokens`](docs/adr/013-semantic-role-token-layer.md)
  — why `tokens.css` has two layers and why component CSS must never
  reference a palette colour directly
- [`014 — Theme preference mechanism`](docs/adr/014-theme-preference-mechanism.md)
  — `data-theme` on `<html>`, and the inline pre-paint script in
  `index.html` that stops the page flashing the wrong theme on load

---

## Romaji

Every study item carries romaji. It is shown by default and can be
turned off in the **Romaji** row of the settings popover, behind the gear
at the bottom of the icon rail. The preference lives in `localStorage`
under `sento:romaji`, per-browser, with no server involvement.

**Search always matches romaji, whether or not it is displayed.**
Suppressing a match for text the user explicitly typed would be a bug,
not a setting — so `neko` finds 猫 even with romaji hidden. This is the
one place the preference deliberately does not apply.

Where the romaji comes from differs by content type, and the split is the
central decision of the epic:

| content | source |
|---|---|
| kanji `onyomi` / `kunyomi` / compound readings | **computed** at read time |
| vocab `reading` (falling back to `word`) | **computed** at read time |
| grammar `pattern` and example sentences | **stored**, hand-authored |
| generated sentences | **stored**, supplied by the AI provider |

Computed values come from `backend/app/services/romaji.py` and are
produced in the `*EntryRead` schemas, so a newly uploaded kanji or vocab
entry returns correct romaji immediately — no migration, no backfill, no
authoring.

Grammar and generated sentences cannot work that way. Both are
multi-word Japanese text, and putting spaces between the words is
*segmentation*, not transliteration — `わたしはがくせいです` run through a
character-level pass yields `watashihagakuseidesu` rather than
`watashi wa gakusei desu`. Grammar patterns additionally contain bare
kanji with no reading to work from. Both are therefore authored:
grammar in the seed data and CSV upload (`pattern_romaji`,
`example_romaji` columns), sentences by the generation provider at
creation time.

Two consequences worth knowing:

- **Sentences saved before epic 009 have no romaji and never will.** It
  only exists if the provider produced it at generation time; there is
  nothing to backfill from.
- **Romanisation is kana-faithful, not macron Hepburn** — `ou`, never
  `ō`. Telling 王 (`ō`) from 追う (`ou`) needs the morpheme boundary,
  which a character-level pass cannot recover, so macrons would
  mis-romanise every う-verb. It also matches what a learner types into
  search.

[`015 — Romaji computed except grammar`](docs/adr/015-romaji-computed-except-grammar.md)
records the full reasoning, including the two rejected alternatives —
storing everything, and computing everything.

---

## Long-content layout

Most study items are one word or one glyph, and a 210px flip tile suits
them. Grammar patterns are not — they are phrases, and five of them
render wider than the tile's 182px of inner width. Vocabulary's
`greetings` has the same problem for a different reason
(よろしくおねがいします is roughly 253px of Japanese at the front face's size).

Those categories render as **full-width rows that flip vertically**
instead. It is the same `FlashcardCard` either way, with a
`layout="grid" | "list"` prop that swaps one class — selection mode,
mastery, the ✓ button, the flip sound, the kanji 音/訓 split and the
romaji toggle all behave identically, because they are literally the
same code.

Which categories get which layout is an explicit table in
`frontend/src/utils/categoryLayout.js`:

| line | default | exceptions |
|---|---|---|
| grammar | **list** | `particles`, `counters`, `conditionals` → grid |
| vocab | grid | `greetings` → **list** |
| kanji | grid | none |

The three grammar exceptions are short fixed-form entries that will
never outgrow a tile. That puts 14 of 17 grammar categories on the list
layout. Adding a category means considering this table — an unlisted
grammar category gets a list, on the assumption that a new pattern is
long until proven otherwise.

Two things worth knowing:

- **Rows flip without resizing.** A row's height comes from its content,
  and its two faces are rarely the same height, so the faces are stacked
  in a single CSS grid cell rather than absolutely positioned. Both stay
  in flow, the taller one sizes the row, and the height is constant
  through the flip.
- **The flip and the selection pulses respect
  `prefers-reduced-motion`.** Each is pinned to a resting state rather
  than removed, so selection mode keeps its affordance.

### Saved sentences flip too

The generator's saved-sentence list uses the same flip. A saved sentence
is study content — it feeds the global quiz pool alongside kanji, vocab
and grammar — and its list was the one surface that showed you the
answer before you had tried to recall it.

| face | content |
|---|---|
| front | the Japanese sentence + romaji |
| back | the kana reading + romaji + the English |

Romaji is on both faces because it does a different job on each: reading
aid for the Japanese, and the Latin partner to the kana. Sentences saved
before epic 009 have no romaji at all, so both faces render without it.

The ✓ used to pick sentences for a quiz sits on both faces, so a flipped
row is still selectable. The folder dropdown and delete button stay on
the front — they are browsing actions, not answer-side ones.

[`016 — Per-category layout and the flip-height mechanic`](docs/adr/016-per-category-layout-and-flip-height.md)
records why this is a table rather than a measurement of the rendered
text, why the faces are in flow, and — in its phase 4 addendum — why the
sentence list repeats the mechanic instead of sharing it.

---

## Responsive layout

The app has one width breakpoint, at **1024px**. Above it, nothing
changes from how the app has always looked: an icon rail on the left,
a content sidebar next to it, the study surface taking whatever's left.
Below it, the rail lays flat into a horizontal top bar and the sidebar
becomes a dismissible overlay drawer instead of permanently taking width
away from the content — the fix for a real bug, not a cosmetic
narrow-screen pass: at 375px, before this epic, the content area
measured **0px** wide.

Nothing new was added to get there. The top bar is the same icon rail
component, restyled — not a second nav bar built alongside it — so
there's still exactly one view switcher and one settings gear in the
app, just laid out differently depending on viewport. The drawer is the
same sidebar, repositioned as an overlay rather than a permanent column.

A few things worth knowing if you're touching this layer:

- **Search and the brand mark move into the top bar below the
  breakpoint, and only there.** Above it they're both in the sidebar as
  before. Search moves because it's the one control that already works
  across all three content lines — leaving it in a drawer that's closed
  by default would have made it two taps away from everywhere.
- **The drawer doesn't close when you pick a category.** Choosing
  several categories in a row shouldn't mean reopening the drawer each
  time — there's a dedicated close arrow inside it for that, alongside
  the top bar's trigger, tapping the scrim, and Escape.
- **Tap targets are 44px effective, even where the visible control is
  smaller.** The ✓ marks and the folder tree's rename/delete buttons
  stay their original visual size — enlarging them would mean
  redesigning the card — but their actual hit area is expanded via CSS,
  keyed to `(pointer: coarse)` rather than to screen width, since a
  touch laptop at 1400px has the same problem a narrow phone does.

[`017 — The 1024px breakpoint, the drawer's stacking contract, and
scoping ADR 004 to desktop`](docs/adr/017-responsive-shell-breakpoint-and-drawer.md)
has the full record: why 1024 rather than a device-size number, the
drawer's stacking contract (and the pre-existing modal-dialog bug its
prototype phase caught and fixed along the way), and why this doesn't
reopen [ADR 004](docs/adr/004-sidebar-only-navigation-topnav-dropped.md)'s
decision against a persistent top nav so much as scope it to desktop.

---

## Word Pairs

A second quiz type, alongside the original multiple-choice one. Where
multiple choice tests *recognition* — pick the right meaning from four —
Word Pairs tests *usage*: the learner picks 2–4 kanji/vocabulary items,
every unordered pair of them becomes one task (C(n,2), so 1–6 pairs), and
for each pair the learner writes one English sentence using both words.

```
presented:  空 (sora) — "sky"      走る (hashiru) — "to run"
accepted:   "You can't run on the sky."
rejected:   "Zeus runs the sky."     ← "run" = manage/operate, not 走る
```

Grading this is a word-sense judgement over free text — no string match
reaches it, since both sentences above contain both words — so it is the
second place in this codebase where asking an AI model is the correct
engineering answer rather than the lazy one (the first being sentence
romaji; see [Romaji](#romaji)).

**One AI call per run, at the end, not one per question.** The learner
writes every pair, submits, and a single `POST /pair-writing/grade` call
carries the whole batch and returns a verdict for each — the same cost
whether the run is one pair or six. Each verdict also carries the
learner's own sentence translated into Japanese (kanji/kana + romaji), in
the same response, so that costs nothing extra either. A blank or clearly
off-task answer never reaches the provider at all — a cheap local check
catches those first.

**The quiz-type chooser lives inside the existing mode bar.** Clicking
"Quiz me" now offers Multiple choice / Word pairs before the item picker
opens, the same in-place-transforming pattern `ModeToggle` already used
for `Quiz me → Start Quiz (n/20)`. A confirm dialog explains the AI
grading before the picker opens — the one point in the flow where
declining still costs nothing.

**Grammar patterns and saved sentences are not eligible.** A pair task
needs a *word* carrying one sense to use or misuse; a grammar pattern is
a phrase with a structural meaning, and a saved sentence is already a
sentence. Selecting a grammar category while building a Word Pairs run
shows why, rather than silently refusing clicks — see
[`docs/epics/012-pair-writing-quiz.md`](docs/epics/012-pair-writing-quiz.md)
§2.2 and §5.

This is the first mode that spends AI provider quota to **take** an
exercise rather than to **create** content — the sentence generator is
occasional, this is the activity you want repeated. It shares the exact
provider-key exposure `POST /sentences/generate` already carried (see
[Admin writes](#admin-writes)), now split across two features on one
shared quota. [ADR 018](docs/adr/018-ai-provider-protocol-narrowed-to-complete.md)
covers the provider-layer change this required and records that
consequence directly; the full design, including the grading rubric and
every rejected alternative, is in
[`docs/epics/012-pair-writing-quiz.md`](docs/epics/012-pair-writing-quiz.md).

---

## Deployment

The frontend is deployed to Vercel. Allowed CORS origins are hardcoded
in `backend/app/middleware/cors.py` — update that list directly when
adding a new deployed frontend origin; it is not env-driven.

**Database migrations are manual.** CI runs `alembic upgrade head` only
against its own ephemeral Postgres, and no deploy configuration runs it
anywhere else — so a schema change reaches staging or production only
when someone runs it by hand against that database's
`MIGRATIONS_DATABASE_URL`. Migrations in this project are additive and
nullable by convention, which keeps already-deployed code working
against a newer schema, but the ordering is convention rather than
something enforced.

---

## Project Structure

```
sento/
├── backend/     # FastAPI application
├── frontend/    # React + Vite application
└── docs/
    ├── epics/   # Epic summaries — problem statement, architecture, decisions
    └── adr/     # Architecture Decision Records
```
