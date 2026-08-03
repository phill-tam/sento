# Sento

A JLPT N5 Japanese language learning platform — vocabulary, kanji, and
grammar study lines, built toward a sentence generator that produces
practice sentences from user-selected items with furigana, romaji, and
translation revealed on demand.

- **Frontend:** React + Vite
- **Backend:** FastAPI + uv + Alembic + PostgreSQL (local) / Supabase (staging/prod)

---

## Project Status

| Epic | Scope | Status |
|---|---|---|
| 001 — Foundation | Visual design system & app shell (frontend) | Complete |
| 002 — Content Management | CSV upload + inventory tree (backend + frontend) | Complete |
| 003–004 — Flashcards / Quiz | — | Planned |
| 005 — Sentence Generator | — | Planned |

Epic write-ups live in `docs/epics/`. Architecture decisions are
recorded as ADRs in `docs/adrs/`.

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

# Activate the virtual environment
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Set up environment variables
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at your local PostgreSQL
instance (see [Environment Variables](#environment-variables) below).

```bash
# Run database migrations
alembic upgrade head

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

The frontend defaults to talking to the backend at
`http://localhost:8000` — no `.env` needed for local dev unless you're
pointing it at a different backend URL (see below).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | App runtime connection. Local dev: `postgresql+psycopg://sento:sento@localhost:5432/sento_db`. Supabase: use the transaction pooler (port `6543`). |
| `MIGRATIONS_DATABASE_URL` | No | Used for Alembic migrations only. Leave blank for local dev — falls back to `DATABASE_URL` automatically. Supabase: use the direct, non-pooler connection (port `5432`). |
| `FEATURE_CONTENT_MANAGEMENT` | No | Toggles the Content Management API (epic 002) on/off. Default `false` — the upload/list routes are entirely absent from the API schema when unset. See [Feature Flags](#feature-flags) below for what enabling this does and does not protect against. |

### Frontend (`frontend/.env`, optional)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | No | Defaults to `http://localhost:8000` if unset. Only needed if the backend isn't running on the default local port. |

---

## Feature Flags

Both frontend and backend gate in-progress epics behind feature flags,
named per-epic (`FEATURE_<EPIC_NAME>`) rather than per-component — see
`docs/adrs/005-feature-flags-per-epic-naming.md` for the reasoning.

- **Frontend:** a plain object in `frontend/src/config/featureFlags.js`
  (`FEATURE_FLAGS.FEATURE_FOUNDATION_SHELL`,
  `FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT`) — no env var required; set
  directly in code.
- **Backend:** `.env`-backed via Pydantic Settings
  (`config/feature_flags.py`).

| Flag | Layer | Default | Status |
|---|---|---|---|
| `FEATURE_FOUNDATION_SHELL` | Frontend | `true` | Shipped (epic 001) |
| `FEATURE_CONTENT_MANAGEMENT` | Frontend + Backend | `false` | Shipped (epic 002) |

**Content Management is not access-controlled.** Enabling
`FEATURE_CONTENT_MANAGEMENT` exposes CSV upload and content-editing
endpoints with no authentication — there is no `User` model or auth
mechanism anywhere in this project yet. The flag controls *visibility*,
not *access*. Do not enable this flag in any environment reachable by
anyone other than yourself. See `docs/adrs/011-no-auth-feature-flag-gated-only.md`.

---

## Project Structure

```
sento/
├── backend/     # FastAPI application
├── frontend/    # React + Vite application
└── docs/
    ├── epics/   # Epic summaries — problem statement, architecture, decisions
    └── adrs/    # Architecture Decision Records
```
