# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sento is a JLPT N5 Japanese study platform: vocabulary/kanji/grammar
flashcards, a mixed-type quiz mode, and an AI sentence generator that
produces practice sentences (with reading + English meaning) from
user-selected content items.

- **Frontend:** React 19 + Vite, plain CSS Modules (no Tailwind, no CSS-in-JS)
- **Backend:** FastAPI + SQLAlchemy + Alembic + PostgreSQL (local) / Supabase (staging/prod), managed with `uv`

`README.md`'s "Project Status" table undersells what's shipped — it
still lists Flashcards/Quiz and the Sentence Generator as "Planned".
In the actual code, four epics beyond Content Management are already
live behind feature flags: Study Flashcards, Quiz Mode, the Sentence
Generator, and a global cross-type Quiz (referred to as "epic 6" in
code comments). Only epics 001 and 002 have write-ups in `docs/epics/`
and ADRs past 011 don't exist — treat in-code comments referencing
"epic N" as the more current source of truth than `docs/`, and verify
docs against `git log` / the code itself before relying on them.

## Commands

### Backend (`backend/`)

```bash
uv sync                                    # install deps
uv run alembic upgrade head                # run migrations
uv run python -m app.seed_data.seed_content  # seed N5 kanji/vocab/grammar (required — API returns empty lists without it)
uvicorn app.main:app --reload              # dev server on :8000
uv run ruff check .                        # lint (CI-enforced)
uv run pytest                              # tests (no tests exist yet — CI only runs this step if backend/tests/** has files)
```

To generate a new migration after changing a model: `uv run alembic revision --autogenerate -m "..."`.

### Frontend (`frontend/`)

```bash
npm install
npm run dev       # dev server on :5173
npm run build     # production build (CI-enforced)
npm run lint       # oxlint (CI-enforced; config: frontend/.oxlintrc.json)
```

There is no `test` script in `package.json` yet — CI's frontend job
only runs `npm run test` if `frontend/src/**/*.test.jsx` files exist.

`.claude/launch.json` defines this dev server for Claude Code's preview
tooling — start it from there rather than running a server through a
shell tool.

## Feature flags

Every epic beyond the always-on foundation shell is gated behind a
flag, named per-epic rather than per-component (see
`docs/adr/005-feature-flags-per-epic-naming.md`).

- **Backend** — `.env`-backed via Pydantic Settings (`backend/app/config/feature_flags.py`, env-prefixed `FEATURE_`): `FEATURE_CONTENT_MANAGEMENT`, `FEATURE_SENTENCE_GENERATOR`. `backend/app/api/v1/router.py` conditionally imports and mounts each feature's routes at import time — checking a flag is not enough on its own; the routes genuinely don't exist in the OpenAPI schema when the flag is off.
- **Frontend** — `frontend/src/config/featureFlags.js`, reading `VITE_FEATURE_*` env vars (`FEATURE_CONTENT_MANAGEMENT` is hardcoded `false` regardless of env, unlike the others — check current code before assuming): `FEATURE_FOUNDATION_SHELL`, `FEATURE_CONTENT_MANAGEMENT`, `FEATURE_STUDY_FLASHCARDS`, `FEATURE_QUIZ_MODE`, `FEATURE_SENTENCE_GENERATOR`.

**Content Management has no auth.** There is no `User` model or
authentication anywhere in this project. `FEATURE_CONTENT_MANAGEMENT`
controls *visibility* only, not *access* — see
`docs/adr/011-no-auth-feature-flag-gated-only.md`. Never suggest
enabling it in a publicly reachable environment.

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
- **CSV upload:** `app/services/content_upload_service.py` implements
  shared partial-success upload logic — one DB savepoint
  (`db.begin_nested()`) per row so one bad row doesn't poison the
  whole session, with a single `db.commit()` at the end. Each content
  line's route supplies its own `row_parser` callback; the service
  only owns the iterate/isolate/count/commit mechanics. See
  `docs/adr/009-csv-upload-partial-success-commit-strategy.md`.
- **Sentence generation provider switch:**
  `app/services/sentence_generation_service.py` picks Gemini
  (`settings.environment == "development"`) or Claude (`"production"`)
  behind a shared `SentenceProvider` protocol — `get_provider()` is
  the *only* place that branches on environment; routes and schemas
  never know which provider served a request. Raises
  `SentenceGenerationRateLimitExceeded` (429) vs
  `SentenceGenerationFailedError` (502) as distinct exception types so
  the route layer can return different responses for each.
- **Settings:** `app/config/settings.py` (Pydantic Settings, reads
  `backend/.env`). `MIGRATIONS_DATABASE_URL` falls back to
  `DATABASE_URL` when unset (local dev has no pooler/direct split;
  Supabase needs the distinction). Note `backend/.env.example` doesn't
  list the Gemini/Anthropic/environment keys that `settings.py`
  actually reads — check `settings.py` directly, not just the example
  file, when setting up `.env`.
- **CORS:** allowed origins are hardcoded in
  `app/middleware/cors.py`, not env-driven — update that list directly
  when adding a new deployed frontend origin.

## Frontend architecture

- **Everything routes through `App.jsx`.** There's no router — `App.jsx`
  holds all top-level state (active view, quiz phase, generator
  workflow phase, selection sets) and switch-renders
  `StudyPage`/`ContentManagementPage`/`GeneratePage`/`QuizRunner`
  inside the shared `AppShell` layout. When adding a new top-level
  view, wire it in here, not via a new router.
- **`AppShell`** (`components/layouts/AppShell.jsx`) is the one shared
  two-pane (icon rail + sidebar + main panel) layout used by every
  page — see `docs/adr/002-appshell-single-shared-layout.md`. There is
  no top nav; all section-switching happens via the sidebar
  (`docs/adr/004-sidebar-only-navigation-topnav-dropped.md`) and the
  icon rail added for the two-tier nav in epic 002
  (`docs/adr/010-two-tier-sidebar-collapsible-navigation.md`). The rail
  renders unconditionally — it carries the settings gear, which stays
  relevant even with every view flag off — while individual view buttons
  are still flag-filtered via `App.jsx`'s `visibleViews`. `AppShell`
  itself is purely structural: it knows nothing about what fills its
  slots.
- **Rail/sidebar stacking is load-bearing.** Both `.rail` and
  `.lineRail` are `position: sticky`, and sticky creates a stacking
  context *unconditionally* (unlike `relative`/`absolute`, which only do
  so with a non-auto z-index). A popover inside the rail therefore
  cannot escape it by raising its own z-index — the rail itself has to
  outrank its sibling, which is why `.rail` carries `z-index: 2` against
  `.lineRail`'s `1`. Anything that must cover both (e.g.
  `ConfirmDialog`'s `z-index: 10` backdrop) has to live outside
  `.shell`, which is its own stacking context at `z-index: 1`.
- **`CategoryTree`** uses a generic `count`/`total`/`complete` prop
  contract rather than a `mastered`-specific one, so it isn't coupled
  to the flashcard mastery feature — see
  `docs/adr/003-categorytree-generic-prop-contract.md`.
- **Selection model spans pages.** Both quiz-item selection
  (`selectedIds`, keyed `"${itemType}:${itemId}"` since ids alone
  can't disambiguate kanji vs. vocab vs. sentence) and the generator's
  source-item selection are lifted to `App.jsx` state so a user can
  build a selection while browsing both Study and Generate before
  starting. Only an *active* quiz or an in-progress generator run
  blocks navigation (`guardNavigation`/`ConfirmDialog`) — merely being
  in "selecting" mode does not.
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
  `useSentenceGenerator` show a dedicated rate-limit message instead
  of a generic failure.
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
  exports one (Global `0.1`, Cards `0.5`) and `SoundSettingsPanel` uses
  it as its slider's `max`, so full-right is the level the app shipped
  with and the readout means "share of normal volume". These were tuned
  by ear against each other; raising either is a mix decision, not a UI
  one. The controls live behind the gear at the bottom of the icon rail
  (`layouts/SettingsButton.jsx`), not in the sidebar.
- **User preferences are plain `localStorage`,** no store library and no
  settings service: prefixed key, lazy `useState(() => read())`
  initializer, write-back in an effect, and every access try/catch
  guarded so private browsing degrades silently instead of throwing.
  Follow that shape for new preferences — see `backsound:muted` /
  `backsound:volume`, `cardsound:muted` / `cardsound:volume`, and
  `hooks/useMastered.js`'s `sento:mastered:{lineId}`.
- **Design tokens** live in `src/styles/tokens.css` as CSS custom
  properties, ported from the original design mockup — see
  `docs/adr/001-design-tokens-css-custom-properties.md`. Every
  component styles via its own `ComponentName.module.css`; there's no
  global component library.

## Docs

- `docs/epics/` — problem statement + architecture per epic (currently
  only 001 and 002 are written up; later epics exist only as shipped
  code + ADRs + in-code "epic N" comments).
- `docs/adr/` — numbered ADRs, one per non-obvious decision. Read the
  relevant one before changing CORS, feature-flag naming, table
  design, route structure, CSV commit strategy, or sidebar navigation
  — the "why not the obvious alternative" is usually already answered
  there.
