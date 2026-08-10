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
| 002 — Content Management | CSV upload + inventory tree (backend + frontend) | Shipped — writes are opt-in, see [Admin writes](#admin-writes) |
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
| `ENVIRONMENT` | No | Default `development`. Selects the AI provider: `development` → Gemini, `production` → Claude. |
| `GEMINI_API_KEY` | If generating in dev | Required when `ENVIRONMENT=development`. |
| `GEMINI_MODEL` | No | Default `gemini-3.5-flash`. |
| `ANTHROPIC_API_KEY` | If generating in prod | Required when `ENVIRONMENT=production`. |
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

**Known gap:** `POST /sentences/generate` is unconditionally mounted and
also unauthenticated. It spends real AI provider quota per call, and the
provider's own rate limit is the only backstop.

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
