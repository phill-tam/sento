# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sento is a JLPT N5 Japanese study platform: vocabulary/kanji/grammar
flashcards, a mixed-type quiz mode with two quiz types (multiple-choice
recognition and AI-graded Word Pairs sentence writing), and an AI
sentence generator that produces practice sentences (with reading +
English meaning) from user-selected content items.

- **Frontend:** React 19 + Vite, plain CSS Modules (no Tailwind, no CSS-in-JS)
- **Backend:** FastAPI + SQLAlchemy + Alembic + PostgreSQL (local) / Supabase (staging/prod), managed with `uv`

Fifteen epics have shipped: Foundation, Content Management, Flashcards,
Quiz Mode, the Sentence Generator, a global cross-type Quiz ("epic 6"
in code comments), Sound, Theming, Romaji, the Long-Content Layout
(flip-list rows, #116), the Responsive Shell (1024px breakpoint,
top bar + overlay drawer, #122), Word Pairs (AI-graded sentence
writing as a second quiz type, #126), Local Sentence Storage (saved
sentences moved out of the database and into the user's browser, #128),
Scoring (durable quiz run history plus a Progress view, #155), and
Ranking (an unauthenticated, device-scoped leaderboard, #161). None of
them are behind feature flags any more — see the section below.

Only epics 001, 002, 009, 012, 013, 014 and 015 have write-ups in
`docs/epics/`; the rest exist as shipped code, the GitHub issues
tracking them, and `epic N` comments in the source. ADRs run to 021.
Treat in-code comments as the more current source of truth than
`docs/epics/`, and verify docs against `git log` / the code itself
before relying on them.

## Commands

### Backend (`backend/`)

```bash
uv sync                                    # install deps
uv run alembic upgrade head                # run migrations
uv run python -m app.seed_data.seed_content  # seed N5 kanji/vocab/grammar (required — API returns empty lists without it)
uvicorn app.main:app --reload              # dev server on :8000
uv run ruff check .                        # lint (CI-enforced)
uv run pytest                              # tests (backend/tests/ — the Word Pairs grading service and its schemas, since epic 012)
```

To generate a new migration after changing a model: `uv run alembic revision --autogenerate -m "..."`.

### Frontend (`frontend/`)

```bash
npm install
npm run dev       # dev server on :5173
npm run build     # production build (CI-enforced)
npm run lint       # oxlint (CI-enforced; config: frontend/.oxlintrc.json)
npm run test       # vitest run (CI-enforced)
npm run test:watch # vitest, for local use
```

**Tests live in `frontend/tests/`, never beside the source** — mirroring
`backend/tests/`, and Vitest's `include` in `vite.config.js` is pinned to
that directory rather than left at its default `**/*.test.*`. The pin is
what makes the convention self-enforcing: an unpinned runner picks up a
stray colocated test and quietly establishes the opposite habit. CI's
condition takes **two** `hashFiles` patterns (`*.test.js` and
`*.test.jsx`) because `@actions/glob` does not expand braces — a single
`*.test.{js,jsx}` matches nothing, so the step would skip and the run
would go green having executed zero tests.

`tests/setup.js` repairs `localStorage`, which is otherwise undefined in
a default Vitest jsdom environment on Node 22.4+ — see its docblock
before touching it. Anything rendered in a test that reaches storage
depends on it.

`.claude/launch.json` defines this dev server for Claude Code's preview
tooling — start it from there rather than running a server through a
shell tool.

## Feature flags — there aren't any

All per-epic feature flags were removed once every epic shipped (see
`docs/adr/012-feature-flags-removed-admin-write-gate.md`, which
supersedes 005). `backend/app/config/feature_flags.py` and
`frontend/src/config/featureFlags.js` no longer exist. Study, Quiz, the
Sentence Generator and the global quiz pool are unconditionally on, and
the app runs with no environment configuration at all. Don't add a
`FEATURE_*` flag back for an epic — finish it on a branch instead.

**The two remaining switches are access control, not feature flags.**
Both default `false`, and both gate endpoints with no authentication in
front of them — there is no `User` model anywhere in this project.

**1. `ADMIN_WRITES_ENABLED`** (backend, `app/config/settings.py`) and
`VITE_ADMIN_WRITES_ENABLED` (frontend, `src/config/adminMode.js`) gate
the content **write** endpoints.

- `app/routes/{kanji,vocab,grammar}.py` each expose **two** routers: `router` (the `GET` list endpoint, always mounted, since Study fetches it on every page load) and `admin_router` (`POST /upload`, `PATCH /{id}/status`, mounted only when the switch is on). Keep new read endpoints on `router` and new write endpoints on `admin_router`.
- The two layers are enforced independently. `VITE_ADMIN_WRITES_ENABLED` only decides whether the CMS UI is offered; setting it without the backend var gives you a page whose requests 404.
- Never suggest enabling `ADMIN_WRITES_ENABLED` in a publicly reachable environment — see `docs/adr/011-no-auth-feature-flag-gated-only.md`.

**2. `SENTENCE_PERSISTENCE_ENABLED`** (backend only, same file) gates
saving, listing, relocating and deleting sentences, plus the whole of
`/sentence-folders`. **Saved sentences live in the user's browser as of
epic 013** (`docs/epics/013-local-sentence-storage.md`, ADR 019), so
nothing calls these — mounted, they are an unattributed shared pile any
visitor can write into, which is what that epic exists to stop.

- `app/routes/sentences.py` exposes **two** routers, same split as the content lines: `router` (`POST /generate`, always mounted) and `persistence_router` (save/list/relocate/delete, gated). `app/routes/sentence_folders.py` is persistence in its entirety, so its router is named `persistence_router` and the whole module is gated.
- The tables and their Alembic history are untouched and **reserved** for the auth epic, which adds `user_id` and turns the switch back on. The production rows were purged by hand — `backend/scripts/purge_production_sentences.md`, deliberately not a migration, since a revision would run against local databases too.
- Set it `True` in a local `.env` only, to exercise the server path.

`POST /sentences/generate` and `POST /pair-writing/grade` (epic 012) are
both unconditionally mounted and also unauthenticated. Both spend real
AI provider quota per call, both draw on the *same* provider key per
environment (`get_provider()` in `app/services/ai_provider.py`), with the
provider's own rate limit as the only backstop for either — a known,
accepted gap (ADR 012), widened rather than newly created by the second
endpoint, and specifically the subject of ADR 018. Don't propose a
per-endpoint kill switch or a `FEATURE_PAIR_WRITING` flag for this —
ADR 018 already covers why that's the wrong shape.

**3. `POST`/`GET /leaderboard`** (epic 015) is also unconditionally
mounted and unauthenticated, but for a different reason than the two
gates above and the two AI endpoints just discussed. Those are all
*interim* — access control (or an accepted gap) standing in for auth
that doesn't exist yet. The leaderboard isn't: there is no state in
which this endpoint being publicly reachable is a mistake, since public
reachability is the entire feature. See ADR 021 — don't propose gating
it behind a settings flag the way the other write endpoints are.

## Backend architecture

- **Routing:** one route file per content line/resource
  (`app/routes/{kanji,vocab,grammar,sentences,sentence_folders}.py`),
  deliberately not one parameterized `/content/{line}` route — see
  `docs/adr/008-per-content-line-route-files.md`. Follow the same
  pattern for new content types rather than introducing a generic
  handler.
- **Models:** Kanji/Vocab/Grammar are three separate dedicated tables
  (`app/models/{kanji,vocab,grammar}_entry.py`), not a shared
  polymorphic table — see `docs/adr/006-...-dedicated-tables.md`. They
  are intentionally decoupled from the sentence generator's own tables
  (`sentence_folders`, `generated_sentences`) — see
  `docs/adr/007-decoupled-from-sentence-generator-item.md`. A saved
  `GeneratedSentence.source_item_refs` is a raw `[{line_id, item_id}]`
  JSONB list with no FK, since it can point into any of three tables.
- **Romaji is computed for two lines and stored for the other — the
  split is by *single word vs. multi-word*, not by content type.**
  `app/services/romaji.py` is a pure kana→romaji function with no ORM or
  framework imports. Kanji (`onyomi`/`kunyomi`/`compound_reading`) and
  vocab (`reading`, falling back to `word`) are computed in the
  `*EntryRead` schemas via Pydantic `@computed_field`, so **those two
  tables have no romaji column and need none** — a newly uploaded entry
  returns correct romaji with no migration and no authoring. Grammar
  (`pattern_romaji`, `example_romaji`) and `GeneratedSentence.romaji`
  are stored columns, hand-authored and provider-supplied respectively,
  because both are multi-word text needing word *segmentation* rather
  than transliteration — `わたしはがくせいです` mechanically yields
  `watashihagakuseidesu`, not `watashi wa gakusei desu`. Grammar
  `pattern` additionally has bare kanji and no reading field at all. See
  `docs/adr/015-romaji-computed-except-grammar.md`; both "store
  everything" and "compute everything" were tried and rejected, so don't
  re-derive either.
- **Romaji output is kana-faithful, not macron Hepburn** — おう→`ou`,
  never `ō`. This is correctness, not style: separating 王 (`ō`) from
  追う (`ou`) needs the morpheme boundary, so macrons would mis-romanise
  every う-verb. `to_romaji` also carries a two-entry fixed-expression
  table (`こんにちは`/`こんばんは`) for fossilised topic-particle は. The
  generation prompt pins the same rules so provider output can't drift
  from computed output.
- **CSV upload:** `app/services/content_upload_service.py` implements
  shared partial-success upload logic — one DB savepoint
  (`db.begin_nested()`) per row so one bad row doesn't poison the
  whole session, with a single `db.commit()` at the end. Each content
  line's route supplies its own `row_parser` callback; the service
  only owns the iterate/isolate/count/commit mechanics. See
  `docs/adr/009-csv-upload-partial-success-commit-strategy.md`.
- **AI provider layer is shared by two features, not owned by one.**
  `app/services/ai_provider.py` (extracted from
  `sentence_generation_service.py` in epic 012, ADR 018) picks Gemini
  (`settings.environment == "development"`) or Claude (`"production"`)
  behind an `AiProvider` protocol narrowed to
  `complete(*, prompt: str, max_tokens: int = 1024) -> str` — prompt in,
  raw text out, nothing sentence-shaped or verdict-shaped baked into the
  interface. `get_provider()` is *still* the only place that branches on
  `settings.environment`; routes and schemas never know which provider
  served a request. Raises `AiProviderRateLimitExceeded` (429) vs
  `AiProviderFailedError` (502) — renamed off "SentenceGeneration" in the
  same move, since a Gemini 429 during answer grading has nothing to do
  with sentences. **Both callers own their own prompt-building and
  response-parsing**: `sentence_generation_service.generate_sentences`
  (`_build_prompt` → `provider.complete` → `_parse_candidates`) and
  `answer_grading_service.grade_pair_answers` (its own prompt →
  `provider.complete` → `_parse_verdicts`, realigning verdicts by
  `pair_id`, never by position — a provider that reorders or drops one
  must not silently shift feedback onto the wrong answer). Adding a
  third AI-backed feature means adding a third `_build_prompt`/`_parse_X`
  pair in that feature's own service, not a new method on the shared
  protocol and not a second `get_provider()`-style switch.
  **`GeminiProvider.complete` accepts `max_tokens` and does not send
  it** — that SDK takes the ceiling inside a `GenerationConfig` object,
  not as a call argument, and wiring it up was judged out of scope for a
  behaviour-preserving refactor. Known gap, not an oversight; see
  ADR 018.
- **Content-line resolution is shared too.** `app/services/content_resolver.py`
  (`LINE_RESOLVERS`, `resolve_source_items`) turns a `SourceItemRef`
  (`line_id`, `item_id`) into real Japanese text — extracted from
  `routes/sentences.py`'s `_LINE_RESOLVERS` once `routes/pair_writing.py`
  needed the identical mapping. Raises `HTTPException` directly from a
  service function, matching this codebase's existing
  "404/409/501 handled at the service layer" convention rather than
  introducing a new one.
- **The leaderboard (epic 015, ADR 021) is never a stored or incremented
  total — it's `SUM(score) GROUP BY device_id`, computed fresh on every
  `GET`.** `app/services/leaderboard_service.py`'s `submit_runs` upserts
  two tables with *opposite* conflict behaviour on purpose:
  `leaderboard_devices.display_name` is `ON CONFLICT DO UPDATE` (a
  resubmission under a new name is a rename), `leaderboard_runs` rows are
  `ON CONFLICT DO NOTHING` keyed on **the run's own id** —
  `scoreStore.recordRun`'s `crypto.randomUUID()`, not server-generated —
  so a run is a historical fact that exists once and can never be
  overwritten by a later resubmission under the same id, honest retry or
  otherwise. Do not build a shared "upsert everything the same way"
  helper for the two tables; that is exactly how one would end up
  silently weakening the run table's `DO NOTHING` guarantee to `DO
  UPDATE`. The public response never carries a raw `device_id` — it
  functions as a bearer credential (ADR 021) — only a truncated
  server-computed SHA-256 (`_hash_device_id`, `device_hash`), checked
  directly by `test_never_exposes_the_raw_device_id` rather than only
  implied by the schema.
- **Settings:** `app/config/settings.py` (Pydantic Settings, reads
  `backend/.env`). `MIGRATIONS_DATABASE_URL` falls back to
  `DATABASE_URL` when unset (local dev has no pooler/direct split;
  Supabase needs the distinction). `GEMINI_API_KEY` and
  `ANTHROPIC_API_KEY` are the only two fields on the class in
  UPPERCASE — deliberate, scoped to exactly those two: they're secrets
  read straight from the environment and nowhere else, so the field
  name mirrors the env var it reads rather than following the lowercase
  convention every other field (`database_url`, `gemini_model`,
  `admin_writes_enabled`...) uses. Functionally inert either way —
  pydantic-settings matches env vars case-insensitively regardless of
  field case — so don't read it as a precedent for renaming the rest of
  the class. `DEFAULT_GEMINI_MODEL` / `DEFAULT_ANTHROPIC_MODEL` are
  named module-level fallbacks, not magic strings inline in the `Field`
  defaults; changing which model runs should always be a `.env` edit
  (`GEMINI_MODEL=...`, matched case-insensitively) and never require
  touching this file.
- **CORS:** allowed origins are hardcoded in
  `app/middleware/cors.py`, not env-driven — update that list directly
  when adding a new deployed frontend origin.

## Frontend architecture

- **Everything routes through `App.jsx`.** There's no router — `App.jsx`
  holds all top-level state (active view, quiz phase, generator
  workflow phase, selection sets) and switch-renders
  `StudyPage`/`ContentManagementPage`/`GeneratePage`/`ProgressPage`, or
  one of the two run components (`components/quiz/QuizRunner.jsx`,
  `PairWritingRunner.jsx`, intercepted above the view switch), inside
  the shared `AppShell` layout. When adding a new top-level view, wire
  it in here — a `VIEWS` entry plus a switch branch — not via a new
  router. Progress (epic 014) needed no sidebar work, because
  `showStudySidebar` is already `view === "study"`, so every non-Study
  view gets a read-only search field and no tree for free.
- **`AppShell`** (`components/layouts/AppShell.jsx`) is the one shared
  two-pane (icon rail + sidebar + main panel) layout used by every
  page — see `docs/adr/002-appshell-single-shared-layout.md`. There is
  no top nav on desktop; all section-switching happens via the sidebar
  (`docs/adr/004-sidebar-only-navigation-topnav-dropped.md`, scoped to
  desktop by epic 011 — see below) and the icon rail added for the
  two-tier nav in epic 002
  (`docs/adr/010-two-tier-sidebar-collapsible-navigation.md`). The rail
  renders unconditionally — it carries the settings gear, which stays
  relevant even with every view flag off — while individual view buttons
  are still flag-filtered via `App.jsx`'s `visibleViews`. `AppShell`
  itself is purely structural: it knows nothing about what fills its
  slots, and still doesn't — epic 011 added one prop
  (`onDismissSidebar`) but not a second `sidebar`-shaped one; see below.
- **Rail/sidebar stacking is load-bearing.** Both `.rail` and
  `.lineRail` are `position: sticky` on desktop (`.lineRail` becomes
  `position: fixed` as the narrow-layout drawer — still under `.rail`),
  and sticky creates a stacking context *unconditionally* (unlike
  `relative`/`absolute`, which only do so with a non-auto z-index). A
  popover inside the rail therefore cannot escape it by raising its own
  z-index — the rail itself has to outrank its sibling, which is why
  `.rail` carries `z-index: 2` against `.lineRail`'s `1`. This is why
  the epic 011 drawer sits *under* the top bar rather than over it: the
  drawer only has to outrank `.platform`, not `.rail`, so neither
  `.rail`'s z-index nor `SettingsButton`'s popover's needed to change.
  `ConfirmDialog` now portals itself to `document.body` (`createPortal`)
  rather than relying on every caller to render it outside `.shell` —
  `SentenceFolderTree` was rendering its own instance *inside* the
  sidebar slot, where the old "z-index 10, but only if you remember to
  render it outside .shell" contract silently didn't hold; the rail
  painted over it. Portalling inside the component fixes every caller at
  once and is now the actual guarantee — don't revert to a bare
  `position: fixed` div and rely on placement again.
- **The shell has exactly one width breakpoint, at 1024px, and it lives
  in five places with no shared source of truth.**
  `AppShell.module.css`, `IconRail.module.css`,
  `SettingsButton.module.css` and `FlashcardGrid.module.css` each carry
  their own `@media (max-width: 1024px)` block; `App.jsx`'s
  `NARROW_LAYOUT_QUERY` constant repeats the same string for
  `useMediaQuery` (`hooks/useMediaQuery.js`), used only for the two
  things CSS can't decide — which slot search and the brand mark render
  into (see below). There's no build-time constant sharing between a
  stylesheet and JS in this toolchain, so all five have to change
  together or the CSS-decided layout and the JS-decided slots disagree
  about where the line is. See `docs/adr/017-responsive-shell-breakpoint-and-drawer.md`
  for why 1024 and not a device-class number, and for a one-pixel
  discrepancy in the originating issue that this implementation
  resolved by taking the literal query (narrow *at* 1024px, not just
  below it).
- **Below 1024px `.lineRail` stops being a sidebar and becomes an
  overlay drawer** — `position: fixed`, a scrim, closed by default
  (reusing `sidebarCollapsed`, not a second piece of state; `isNarrow`
  from `useMediaQuery` just decides which meaning the boolean has).
  Four ways to dismiss it — the top bar's trigger, the scrim, Escape, an
  arrow inside the drawer — and **selecting a category does not close
  it**; that's what the in-drawer arrow is for. The open drawer is modal
  via `inert` on `<main>`, not a hand-rolled focus trap. Search
  promotion into the drawer (a non-empty query opens it, since results
  render in the drawer) required a focus-handling exception: the drawer
  normally steals focus to its close arrow on open, but not when the
  currently focused element is a text input, or every keystroke in
  search would eject the caret. `IconRail` itself is one instance,
  restyled horizontally below the breakpoint via props
  (`onToggleSidebar`, `search`, `brand`, all `undefined` above it) —
  **never render a second `IconRail` for a mobile bar**; a WIP branch
  that predates this epic did that and is exactly the anti-pattern the
  epic's ADR records rejecting. Same one-instance rule for
  `TopBarSearch` (search moves from the sidebar into the bar below the
  breakpoint, never renders in both) and the brand mark (sidebar logo
  above the breakpoint, resized top-bar logo below it). Full writeup:
  `docs/adr/017-responsive-shell-breakpoint-and-drawer.md`.
- **Touch targets are expanded via a pseudo-element, keyed on
  `(pointer: coarse)`, not on the width breakpoint** — a tap target is a
  pointer question, not a viewport one. See the ✓ buttons in
  `FlashcardCard.module.css` and `SentenceListItem.module.css`, and the
  folder actions in `SentenceFolderTree.module.css`. The flashcard ✓
  specifically needs an *asymmetric* inset, not a symmetric one — the
  flip uses `transform-style: preserve-3d`, and hit-testing does not
  extend past a face's own edge inside that context, so a pseudo-element
  hanging outside the face never receives a tap; bias the expansion
  toward the dot's own corner instead. Separately,
  `SentenceFolderTree.module.css`'s rename/delete buttons used to be
  `opacity: 0` until `.folderHead:hover` — invisible *and* unreachable
  on touch, not just undiscoverable. They're visible by default now,
  hidden again only under `(hover: hover)` paired with `:focus-within`.
- **`CategoryTree`** uses a generic `count`/`total`/`complete` prop
  contract rather than a `mastered`-specific one, so it isn't coupled
  to the flashcard mastery feature — see
  `docs/adr/003-categorytree-generic-prop-contract.md`.
- **A flashcard has two layouts, one component.** `FlashcardCard` takes
  `layout="grid" | "list"`, which swaps one class — every branch, both
  handlers, the ✓ button's two meanings, the 音/訓 split and the romaji
  gate are shared verbatim, the same way `ToggleSwitch` handles
  `orientation`. "list" is a full-width row that flips *vertically*, for
  content a 182px tile can't hold: grammar patterns are phrases, and
  vocab's `greetings` holds よろしくおねがいします. Don't add a parallel list
  component. **The height mechanic is the load-bearing part:** in list
  mode the two faces stop being `position: absolute` and become grid
  items sharing one cell (`.inner { display: grid }`,
  `.face { grid-area: 1 / 1 }`), so both are in flow, the taller sizes
  the row, and the row can't resize mid-flip. Don't "tidy" the faces
  back out of flow.
- **Which categories get a list is a table, not a measurement.**
  `utils/categoryLayout.js` — grammar defaults to list except
  `particles`/`counters`/`conditionals`; vocab is grid except
  `greetings`; kanji is always grid. Measuring rendered text was
  considered and rejected (it can only run post-paint, so it shifts, and
  it leaves no readable answer for why a category is a list) — see
  `docs/adr/016-per-category-layout-and-flip-height.md` before replacing
  it. An unknown *line* or no category falls back to grid; an unlisted
  *category* falls back to its line's default, deliberately, so a new
  grammar category doesn't silently get tiles it will overflow.
- **`FlashcardGrid`'s tile cap is scoped to the narrow layout, not
  global — this is deliberate, not an oversight.**
  `grid-template-columns: repeat(auto-fill, minmax(180px, 260px))`
  (epic 011) only applies below 1024px, replacing the uncapped
  `minmax(180px, 1fr)` that let a single narrow-viewport column stretch
  a 210px-designed tile to 335px. Applying the same cap above the
  breakpoint was tried and measured: `auto-fill` counts its repetitions
  from the track's *maximum* sizing function once that's no longer
  `1fr`, so swapping in `260px` changes the desktop grid from four
  226px columns to three 260px ones — moving the tile further from its
  210px design width, not closer. Don't remove the media-query scoping
  to "simplify" this.
- **The saved-sentence row flips too, and repeats the mechanic rather
  than sharing it.** `SentenceListItem` is a second flipping list —
  front is `jp_text` + romaji, back is `reading` + romaji +
  `meaning_en`, so romaji is on both faces. Its CSS re-states the
  grid-stacked-faces rules instead of importing them: CSS Modules can't
  share a rule, `composes:` is used nowhere in this codebase, and
  `FlashcardCard`'s version is mostly *undoing* the 200px tile while
  this one has no tile to undo. **If you change the flip mechanic,
  change it in both modules.** The ✓ is on both faces so a flipped row
  stays selectable; relocate/delete are front-only, and every control
  stops the row gesture on click *and* keydown (the row answers Space,
  which is also how a `<select>` opens). This softens epic 5's "list
  display, not grid" posture on purpose — see the phase 4 addendum in
  `docs/adr/016-per-category-layout-and-flip-height.md`.
- **One selection state, not one per picker.** `App.jsx` holds a single
  `selection = { kind: null | "quiz" | "generator" | "pairs", ids: Set }`
  rather than a separate phase+ids pair per picker (epic 012 unified what
  used to be two independent pairs, hand-synchronised at every entry
  point — see the git history on `handleGeneratorClick`/`handleModeChange`
  if you need the "why" in more detail than this bullet). `ids` is keyed
  `"${itemType}:${itemId}"` since a bare id can't disambiguate kanji vs.
  vocab vs. sentence once selection spans lines. **Entering any picker
  replaces the whole object** via `beginSelection(kind)` — there is no
  second set left over to remember to clear, which is what makes a third
  (and someday fourth) picker free instead of another six pairwise
  clears. `quizPhase`, `generatorSelectedIds` etc. that child components
  still receive as props are *derived* from `selection` each render, not
  held separately — `StudyPage`, `FlashcardGrid` and `ModeToggle` all
  keep their pre-existing prop contracts and don't know this unification
  happened. Selection is lifted to `App.jsx` so a user can build one
  while browsing both Study and Generate before starting; only an
  *active* quiz or an in-progress generator run blocks navigation
  (`guardNavigation`/`ConfirmDialog`) — merely being in "selecting" mode
  does not.
- **Word Pairs (epic 012) is the second quiz type, not a second quiz
  mode.** `App.jsx`'s `quizType` (`"choice" | "pairs"`) is derived from
  `selection.kind === "pairs"`, not held as separate state, so the
  type-chooser (`QuizTypeChooser`) and the selection it's building can
  never disagree about which run is under construction. `PAIR_SELECTION_CAP`
  (4, not the quiz's 20 — every unordered pair becomes a task, C(4,2)=6
  is already the longest run in the app) and `PAIR_ELIGIBLE_LINES`
  (`kanji`/`vocab` only — a grammar pattern is a phrase with a
  structural meaning, not a word with a sense to misuse) live in
  `App.jsx` beside the quiz's own constants. Picking pairs on a grammar
  category **stays in selection mode with every card refused**
  (`FlashcardGrid`'s `selectionLocked` prop) rather than dropping out of
  selection mode — outside selection mode the ✓ is the *mastery* toggle,
  so leaving would silently repurpose the control a learner is reaching
  for. `usePairWriting` (the run state machine: pairs frozen at mount via
  `utils/wordPairs.js`'s `buildPairs`, phase `writing → grading →
  complete`) and `utils/answerPrecheck.js` (the local pre-check that
  resolves blank/off-task answers without spending a provider call — it
  is built to *under*-trigger, since a false positive tells a learner who
  wrote a correct sentence that they didn't, which is worse than the
  call it would have saved) are the two pieces of real logic; everything
  else under `components/quiz/Pair*.jsx` is presentation. Verdicts from
  the backend are matched to pairs **by identity** (`pair.words.find` on
  `line_id`/`item_id`), never by array position — the backend itself
  refuses to align positionally for the same reason, and a rendering bug
  caught exactly this class of mismatch during development (reversed
  word order in a test fixture put the ✕ on the wrong word while still
  reading as confident feedback).
- **Global quiz pool:** `App.jsx`'s `globalQuizPool` flattens every
  kanji/vocab/grammar entry across all categories plus every saved
  `GeneratedSentence` into one shared item shape
  (`{id, lineId, prompt, reading, answer, example}`), consumed by
  `useQuiz`. `lineId: "sentence"` is what `useQuiz` branches on to
  resolve distractors from `source_item_refs` instead of same-line
  peers.
- **Adapters** (`utils/contentTreeAdapter.js`,
  `utils/studyTreeAdapter.js`) reshape flat API entries into the
  tree/category shapes `CategoryTree` and `FlashcardGrid` expect —
  look here first when the sidebar tree or flashcard grid renders
  something unexpected, before assuming the API response is wrong.
- **API client** (`src/api.js`) is a single `fetch` wrapper
  (`request()`); `RateLimitError` is a distinct subclass of `ApiError`
  detected from the backend's specific 429 body shape
  (`body.detail.error === "rate_limit_exceeded"`), letting
  `useSentenceGenerator` **and** `usePairWriting` (epic 012's
  `gradePairAnswers`) both show a dedicated rate-limit message instead
  of a generic failure, with no per-feature detection code — both AI
  endpoints return the identical 429 shape on purpose (ADR 018). Both
  error classes are **declared in `src/errors.js`** and re-exported
  here, so the local sentence store can throw the same shapes without
  importing the fetch client; import them from either place.
- **Store modules live in `src/stores/`.** `sentenceStore.js`,
  `localSentenceStore.js`, `scoreStore.js` (epic 014) and
  `identityStore.js` (epic 015 — `getDeviceId`/`getDisplayName`/
  `setDisplayName`). `api.js` and `errors.js` stay at `src/` root
  deliberately — the first is the HTTP client rather than a store, and
  the second is shared by both it and the local store, so moving either
  would assert a boundary that isn't there.
- **`identityStore.js` is a plain module, not a hook — unlike every
  other `sento:*` preference (`sento:theme`, `sento:romaji`).** Those
  assume every reader is a React component: `useState(() => read())`
  plus a write-back effect, no store module needed. `deviceId` breaks
  that assumption — `api.js` reads it outside any component to stamp a
  leaderboard submission, and epic 016 will read it again for its
  per-device AI quota — so it needs the same shape `scoreStore.js` uses
  for the identical reason. `deviceId`/`displayName` are two ordinary
  preference keys, not a shared `sento:profile` record: that was the
  original plan (issue #155), but it stopped holding once `deviceId`
  gained a second, unrelated consumer in epic 016 and no longer shared a
  single lifecycle with `displayName`.
- **`useLeaderboard` (epic 015) loads the board unconditionally on
  mount and treats syncing as a separate, explicit action.** Reading the
  board needs no identity; `sync(name)` is what ADR 020 requires — a
  leaderboard submission must not inherit `scoreStore`'s silent-swallow-
  on-write convention, since the user asked for this one and is waiting
  on it, so a failure sets `syncError` instead of disappearing. `sync`
  returns `true`/`false` rather than leaving the caller to infer success
  from state after the `await` — not guaranteed to reflect it yet — so
  `LeaderboardSyncDialog` knows synchronously whether to close itself or
  stay open on the error it just set.
- **Quiz results are persisted client-side by
  `src/stores/scoreStore.js`** (epic 014, ADR 020): `recordRun`,
  `readRuns`, `readStats`, `clearRuns` over one versioned `sento:scores`
  key, capped at 200 runs. **A stored run's `total` is the denominator
  that was SHOWN to the learner** — `totalQuestions` for a choice quiz,
  `gradedCount` for word pairs — because `PairQuizSummary` refuses to
  score a partly-graded run out of its pair count, and storing the pair
  count would recreate that exact lie on the Progress page.
  `skippedCount`/`ungradedCount` carry the rest. The two runners build
  their records separately for this reason; **do not unify them behind a
  shared record-builder.** Recording happens on the transition into
  `phase === "complete"`, not in `onFinish` (which fires on the button,
  so closing the tab at the summary would lose the run), and each runner
  latches with a `useRef` — not against StrictMode's mount-time
  double-invoke, which returns early there, but against the effect
  re-running when a dependency changes identity after completion.
  `readStats()` derives everything; nothing computed is stored.
- **This store quarantines on read but swallows on write**, taking one
  half from each existing convention — see
  `docs/adr/020-score-history-storage-conventions.md`. The two are
  independent questions: a store rewrites its whole key on write, so an
  empty read is the first half of a delete (hence quarantine); and a
  failed write shouts only if the user asked for the operation (a
  finished quiz did not, so it stays quiet). **Epic 015's leaderboard
  submit must not inherit the swallow.**
- **Saved sentences do not come from the API — import them from
  `src/stores/sentenceStore.js`.** That module is the boundary (epic 013,
  ADR 019): it re-exports `src/stores/localSentenceStore.js`, a `localStorage`
  implementation of the same eight functions `api.js` declares, with
  identical signatures and identical error shapes (404, 409) so callers
  cannot tell them apart. `api.js` keeps its own now-unused copies for
  the auth epic, which is when `sentenceStore.js` gains an actual
  branch — **it deliberately has none today**, since the remote arm is
  unreachable until there is a user to scope it to. Generation is *not*
  behind this seam: `generateSentences` still comes straight from
  `api.js`, because it needs a provider key and cannot move
  client-side. `useSentenceGenerator`'s split import is that line drawn
  in one place.
- **The local store's rules, none of which are incidental.** Sentences
  are keyed per folder (`sento:sentences:{folderId}`, plus a literal
  `sento:sentences:uncategorized` since `null` can't be a key segment),
  so a save rewrites one folder rather than the library. Three
  consequences: the unscoped read (the global quiz pool's) fans out
  across every key; **relocate writes the destination before removing
  from the source**, because with no transaction available a
  mid-failure duplicate is recoverable and a mid-failure loss is not;
  and deleting a folder must delete its sentence key too. **Unreadable
  data is quarantined, never dropped** — an unknown envelope version, a
  failed parse or a bad shape renames the key to
  `…:quarantine:{timestamp}` rather than returning `[]`, because the
  obvious reader destroys the user's whole library exactly when
  something has already gone wrong. And **storage failure is surfaced,
  not swallowed**: reads degrade to empty but writes throw, unlike every
  preference in the app, because this is the only copy of the user's
  data. `getStorageStatus()` feeds the notices in
  `components/generator/StorageNotices.jsx`.
- **Anything that would drop saved sentences must confirm first.** The
  browser holds the only copy, so `SentenceListItem`'s delete goes
  through `ConfirmDialog` — it had no confirmation at all while the
  server was the store, which was fine then and is not now. The same
  rule binds the auth epic's login-time import, which clears local
  storage on success.
- **Sound is two independent systems, on purpose.** Background music
  (`context/BacksoundContext.jsx`, a looped `Audio` element) and card
  flip effects (`utils/cardSoundEffects.js`, a module-level Web Audio
  context with a decoded-buffer cache, driven by
  `context/CardSoundContext.jsx`) keep separate mute state, separate
  volume and separate storage keys. Muting one must never silence the
  other — the "epic 007" comment in `FlashcardCard.jsx` is where that
  rule comes from. Don't merge them into one sound context.
  `context/SoundProviders.jsx` composes both so `App.jsx` mounts a
  single wrapper.
- **`MAX_VOLUME` is a ceiling, not just a default.** Each sound context
  exports one (Global `0.1`, Cards `0.5`) and `SettingsPanel` uses it
  as its slider's `max`, so full-right is the level the app shipped
  with and the readout means "share of normal volume". These were tuned
  by ear against each other; raising either is a mix decision, not a UI
  one. The controls live behind the gear at the bottom of the icon rail
  (`layouts/SettingsButton.jsx`), not in the sidebar.
- **`SettingsPanel` is the gear popover's contents, not a sound
  component.** It was `SoundSettingsPanel` until Theme moved in beside
  Sound; it's named for the popover now, and new settings sections
  belong in it rather than in a second panel. Sections are separated by
  `.panel > .heading:not(:first-child)`, so adding one needs no extra
  rule.
- **User preferences are plain `localStorage`,** no store library and no
  settings service: prefixed key, lazy `useState(() => read())`
  initializer, write-back in an effect, and every access try/catch
  guarded so private browsing degrades silently instead of throwing.
  Follow that shape for new preferences — see `backsound:muted` /
  `backsound:volume`, `cardsound:muted` / `cardsound:volume`,
  `sento:theme`, `sento:romaji`, and `hooks/useMastered.js`'s
  `sento:mastered:{lineId}`. Each preference gets its own key; there is
  no single `sento:prefs` blob, deliberately. `sento:deviceId` (epic 015,
  minted on first load, read by both the leaderboard and epic 016's
  per-device AI quota) and `sento:displayName` (epic 015, leaderboard
  only) are two more of these, not one shared `sento:profile` record —
  the two fields turned out to have different consumers and different
  lifecycles, not a single "identity" lifecycle, once 016 was scoped.
- **A *record* is not a preference, and takes one key for the whole
  thing.** `sento:folders` holds the folder list, `sento:scores` the run
  history. The one-key-per-value rule above governs *settings* —
  independent values a user flips one at a time. A record's fields are
  always read and written as a unit, so splitting them buys no isolation
  and only invents half-written states. The test is whether any
  operation touches one field and not the other; if none does, it is one
  key. Records also carry a versioned envelope (`{ v, items }`), which
  is the only thing that makes a future shape change migratable in a
  store nothing can run migrations against.
- **Romaji visibility gates display only, never search.**
  `context/RomajiContext.jsx` (`sento:romaji`, mounted in `main.jsx`
  beside `ThemeProvider`, defaults **on**) is read by the card
  components. `utils/searchIndex.js` deliberately ignores it — matching
  romaji is what makes the app usable without a Japanese keyboard, and
  suppressing a match for text the user typed would be a bug, not a
  setting. `romajiFor` mirrors `readingFor` field-for-field so a romaji
  query hits exactly what the equivalent kana query would.
  `readStoredVisible` must fall through to `DEFAULT_VISIBLE` on an
  absent key — comparing `getItem(...) === 'true'` directly silently
  pins new visitors to off regardless of the default.
- **Nothing transliterates on the frontend.** Every romaji value arrives
  from the API already rendered. There is no kana table in JS and no
  romaji dependency — that's what keeps the frontend's runtime deps at
  `react` + `react-dom`. Don't add one.
- **Design tokens** live in `src/styles/tokens.css` as CSS custom
  properties, ported from the original design mockup — see
  `docs/adr/001-design-tokens-css-custom-properties.md`. Every
  component styles via its own `ComponentName.module.css`; there's no
  global component library.
- **`tokens.css` has two layers, and only one of them is public.**
  *Pigment* tokens (`--teal-deep`, `--gold`, `--cream`, `--mist-line`,
  the `--night-*` ramp) are private to that file. *Role* tokens
  (`--surface-card`, `--text-secondary`, `--border`, `--accent-*`,
  `--shadow-*`) are what component CSS references. **Never use a
  pigment token inside a `.module.css`** — see
  `docs/adr/013-semantic-role-token-layer.md`. The split exists because
  three pigments each carried two roles that a theme has to move in
  opposite directions: `--mist-line` was both a card border and muted
  body text, `--mist` was muted text on dark chrome *and* hint text on
  light pages, `--teal-deep` was the chrome background *and* the
  primary button fill. `grep 'var(--teal\|--gold\|--cream\|--ink\|--mist'
  src/styles/*.module.css` should stay empty.
- **A component can get its own day-only role tokens, scoped to it
  alone, rather than repointing a shared one.** `QuizCard` and
  `PairPromptCard` (epic 012) both restyle to a dark teal fill with gold
  type by day — a look no other card in the app uses. The tokens
  (`--quiz-card-bg`, `--quiz-card-content-bg`, `--text-on-quiz-card`,
  `--good-on-quiz-content`/`--bad-on-quiz-content`, etc.) are still role
  tokens living in the same `:root` block as everything else, not a
  third layer — the pattern that's new is that **night's block
  re-points every one of them straight back to the ordinary shared
  token** (`--quiz-card-bg: var(--surface-card)`, `--text-on-quiz-card:
  var(--text-primary)`, ...), so at night these two cards render through
  the *exact same* custom-property chain they would if the tokens didn't
  exist. Repointing `--surface-card`/`--surface-field` directly was
  rejected because those are shared by every card, dialog and field in
  the app — this restyle is scoped to two screens. Follow this shape for
  a future component-specific look: new role tokens, day gets the
  bespoke value, night aliases back to the existing shared token, never
  the other way around. `--progress-btn-bg` (epic 015) is the same
  pattern's second instance — `ProgressPage`'s secondary buttons get a
  teal-mid wash by day, re-pointed to plain `transparent` at night.
- **A tinted status background needs `background-image`, not
  `background-color`, once two rules can both set the element's
  background.** `.option` sets `background: var(--quiz-card-content-bg)`;
  `.correct`/`.incorrect` used to set `background: var(--good-wash)` —
  same property, same specificity, declared later, so the wash rule won
  outright and REPLACED the box colour rather than tinting it, and the
  now-unopposed semi-transparent wash composited against whatever was
  behind the whole option (the card), not against the box. Invisible
  while the card and the box happened to be the same colour; wrong the
  moment they weren't. Fixed by painting the tint as a flat-stop
  `linear-gradient(var(--good-wash), var(--good-wash))` on
  `background-image`, a distinct CSS property from `background-color`
  that layers on top of it instead of overriding it. If a future status
  state needs to tint a surface that already has its own background
  colour, this is the shape — verify with
  `getComputedStyle(el).backgroundColor` still reading the untinted
  value, not just that the rendered colour looks different. The exact
  same mistake happened again in epic 015: `ProgressPage.module.css`'s
  `.secondaryBtn:hover` set `background: var(--accent-wash-hover)`
  directly against a base rule that had just started setting
  `background: var(--progress-btn-bg)`, caught before merge and fixed
  the same way. Two instances is a pattern, not a coincidence, so reach
  for `background-image` on the *first* attempt at a hover/status tint
  over an already-coloured element, not after finding it broken.
- **The night theme is one block, not a second stylesheet.**
  `:root[data-theme="dark"]` at the bottom of `tokens.css` re-points the
  role layer and nothing else, so no component knows a theme exists.
  It's deliberately **not** an inversion: the icon rail and sidebar were
  already dark against a light content area, so at night the chrome
  shifts hue and stays put while the content surfaces come down to meet
  it. The gold accent is shared by both themes on purpose.
  `AppShell.module.css`'s `.backdrop` is the one rule still on raw
  values — each wash is welded to its own hero image (`hero.gif` vs
  `hero-night.gif`), so it branches per theme rather than tokenising.
- **Theme state:** `context/ThemeContext.jsx`, `sento:theme` in
  `localStorage`, values `light` / `dark` only, default `light`. The
  stored value is stamped straight onto `<html>` as `data-theme`;
  there's nothing to resolve. **The app ignores `prefers-color-scheme`
  entirely** — that's deliberate, not an oversight, and ADR 014 records
  both the reasoning and the fact that it's the first thing to revisit
  if anyone asks why the app doesn't follow their system. A `system`
  value existed briefly and was removed once day became the default:
  nothing arrived in that state, so it was a modelled state the UI
  couldn't select. Don't reintroduce it without reading ADR 014.
  **The stored-value rule is duplicated in `frontend/index.html`** as a
  blocking inline script, so the theme applies before first paint
  instead of flashing after React mounts; if you change the rule, change
  both. `ThemeProvider` is mounted in `main.jsx`, not `App.jsx`, because
  it writes to `document.documentElement`.
- **Two controls, one source of truth.** A vertical `ToggleSwitch` sits
  beside Start on `StartGate` (absolutely positioned against a wrapper
  so it can't push Start off-centre), and a horizontal one sits in the
  Theme row of `SettingsPanel`. Both read `theme` from the context
  rather than holding local state, so they can't disagree.
  `ToggleSwitch` takes an `orientation` prop for this; the variant is
  scoped under `.vertical` and inert for every horizontal caller.

## Docs

- `docs/epics/` — problem statement + architecture per epic (currently
  only 001, 002, 009, 012, 013, 014 and 015 are written up; other
  epics exist only as shipped code + ADRs + in-code "epic N" comments).
- `docs/adr/` — numbered ADRs, one per non-obvious decision. Read the
  relevant one before changing CORS, feature-flag naming, table
  design, route structure, CSV commit strategy, sidebar navigation,
  the token layer (013), theme resolution (014), where romaji comes
  from (015), which layout a category gets and how a variable-height
  row flips (016), the shell's breakpoint and the drawer's stacking
  contract (017), the AI provider protocol and the quota it now
  shares between sentence generation and Word Pairs grading (018),
  which `localStorage` error convention a new store follows (020), or
  what an anonymous, unauthenticated write endpoint may and may not
  promise (021) — the "why not the obvious alternative" is usually
  already answered there.
