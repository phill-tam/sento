# Sento

A JLPT N5 Japanese language learning platform — vocabulary, kanji, and
grammar study lines, a mixed-type quiz mode, and an AI sentence
generator that produces practice sentences (with reading and English
meaning) from user-selected content items.

- **Frontend:** React 19 + Vite, plain CSS Modules
- **Backend:** FastAPI + uv + Alembic + PostgreSQL (local) / Supabase (staging/prod)

---

## Project Status

| Epic | Scope | Status |
|---|---|---|
| 001 — Foundation | Visual design system & app shell (frontend) | Shipped |
| 002 — Content Management | CSV upload + inventory tree (backend + frontend) | Shipped — frontend view currently disabled in code, see [Feature Flags](#feature-flags) |
| 003 — Flashcards | Flip-card grid + cross-line search (frontend) | Shipped |
| 004 — Quiz Mode | Selective-recall multiple-choice quiz (frontend) | Shipped |
| 005 — Sentence Generator | AI sentence generation + folders (backend + frontend) | Shipped |
| 006 — Global Quiz | Cross-line, mixed-type quiz pool incl. saved sentences (frontend) | Shipped |
| 007 — Sound | Background music + card flip effects, per-system controls | Shipped |

Only epics 001 and 002 have write-ups in `docs/epics/`, and ADRs stop
at 011. Later epics exist as shipped code, the GitHub issues that track
them, and `epic N` comments in the source — treat those as more current
than `docs/` when the two disagree. Architecture decisions are recorded
as ADRs in `docs/adr/`.

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

# Set up environment variables — every feature beyond the bare scaffold
# is flag-gated and OFF by default, so this step is not optional
cp .env.example .env

# Start the dev server
npm run dev
```

Set at least `VITE_FEATURE_FOUNDATION_SHELL=true` in `frontend/.env`;
without it the app renders a single `Sento — scaffold running` line. See
[Feature Flags](#feature-flags) for the rest.

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
| `FEATURE_CONTENT_MANAGEMENT` | No | Default `false`. Toggles the Content Management API (epic 002). |
| `FEATURE_SENTENCE_GENERATOR` | No | Default `false`. Toggles the sentence + folder API (epic 005). |
| `ENVIRONMENT` | No | Default `development`. Selects the AI provider: `development` → Gemini, `production` → Claude. |
| `GEMINI_API_KEY` | If generating in dev | Required when `ENVIRONMENT=development` and the generator flag is on. |
| `GEMINI_MODEL` | No | Default `gemini-3.5-flash`. |
| `ANTHROPIC_API_KEY` | If generating in prod | Required when `ENVIRONMENT=production` and the generator flag is on. |
| `ANTHROPIC_MODEL` | No | Default `claude-sonnet-4-5`. |

The `ENVIRONMENT` / provider keys are read by
`app/config/settings.py` but are **not** listed in `.env.example` — check
`settings.py` directly when setting up an environment.

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | No | Defaults to `http://localhost:8000`. |
| `VITE_FEATURE_*` | Yes, in practice | One per epic — see below. |

---

## Feature Flags

Both layers gate epics behind feature flags, named per-epic
(`FEATURE_<EPIC_NAME>`) rather than per-component — see
[`docs/adr/005-feature-flags-per-epic-naming.md`](docs/adr/005-feature-flags-per-epic-naming.md).

- **Frontend:** `frontend/src/config/featureFlags.js`, reading
  `VITE_FEATURE_*` env vars.
- **Backend:** `.env`-backed via Pydantic Settings
  (`backend/app/config/feature_flags.py`, env prefix `FEATURE_`).
  `api/v1/router.py` conditionally *imports and mounts* each feature's
  routes at import time — with a flag off, those routes are absent from
  the OpenAPI schema entirely, not merely refused.

| Flag | Layer | Default | Notes |
|---|---|---|---|
| `FEATURE_FOUNDATION_SHELL` | Frontend | `false` | Epic 001. Everything renders inside this; nothing works without it. |
| `FEATURE_CONTENT_MANAGEMENT` | Frontend + Backend | `false` | Epic 002. **Frontend value is hardcoded `false`** in `featureFlags.js` and ignores the env var — the CMS view cannot be reached without a code change. The backend flag is genuinely env-driven. |
| `FEATURE_STUDY_FLASHCARDS` | Frontend | `false` | Epic 003. Gates the content fetch and the Study view. |
| `FEATURE_QUIZ_MODE` | Frontend | `false` | Epic 004 / 006. |
| `FEATURE_SENTENCE_GENERATOR` | Frontend + Backend | `false` | Epic 005. Frontend also controls whether saved sentences join the global quiz pool. |

**Content Management is not access-controlled.** Enabling
`FEATURE_CONTENT_MANAGEMENT` exposes CSV upload and content-editing
endpoints with no authentication — there is no `User` model or auth
mechanism anywhere in this project. The flag controls *visibility*, not
*access*. Do not enable it in any environment reachable by anyone other
than yourself. See
[`docs/adr/011-no-auth-feature-flag-gated-only.md`](docs/adr/011-no-auth-feature-flag-gated-only.md).

The same caveat applies to `FEATURE_SENTENCE_GENERATOR`: the generate
endpoint spends real AI provider quota and is equally unauthenticated.

---

## Deployment

The frontend is deployed to Vercel. Allowed CORS origins are hardcoded
in `backend/app/middleware/cors.py` — update that list directly when
adding a new deployed frontend origin; it is not env-driven.

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
