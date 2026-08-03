# Epic 002 — Content Management: Upload System & Inventory Tree

**Status:** Complete
**Repo:** sento
**Scope:** Backend (FastAPI) + Frontend (React/Vite)

---

## 1. Problem Statement

Content previously existed only as a hardcoded Python list — adding or
editing an entry required a code commit. That doesn't scale to three
content lines (Kanji, Vocabulary, Grammar) with potentially hundreds of
entries each, and doesn't match "content management system."

This epic delivers CSV batch upload per content line, with partial-success
semantics (good rows save even if others in the same file fail), plus an
inventory tree UI built on epic 001's `CategoryTree`, with a content-line
dropdown for browsing and verifying what's been uploaded.

This is an authoring tool, not a learner-facing feature. No quiz,
flashcard, or generator logic lives here — those consume this epic's
data in later epics.

---

## 2. Architecture Overview

**Three dedicated tables, not one shared table.** `KanjiEntry`,
`VocabEntry`, and `GrammarEntry` are separate models, each shaped for
what it actually needs — Kanji's onyomi/kunyomi/compound fields and
Grammar's static example-sentence triple have no equivalent in the other
two lines. See ADR 006.

**Deliberately decoupled from the Sentence Generator's `Item` table.**
The same word could theoretically need entering twice — once as an
`Item` for generation, once as a `VocabEntry` for study. That duplication
is accepted rather than solved here, since a unification design would
mean guessing at a merge this epic has no usage data to justify yet. See
ADR 007.

**Status/source enums extracted to a shared module.** `ContentStatus`
(`draft`/`suggested`/`approved`) and `ContentSource`
(`manual`/`llm_suggested`) live in `models/content_status.py` and are
reused by all three models via the same underlying Postgres enum types —
not duplicated three times.

**Upload is CSV, per content line, partial-success, row-numbered from the
first data row (row 1 = first row after the header).** Each row is
validated and inserted independently via a per-row Postgres savepoint
(`db.begin_nested()`), with a single `db.commit()` after the full batch
completes — not committed per row. See ADR 009 for the full reasoning,
including why a plain try/except around `db.add()` doesn't actually
achieve partial-success on its own (a failed flush poisons the whole
SQLAlchemy session without savepoint isolation).

**Three separate route files, not one generic
`/content/{line}/upload` endpoint.** Each line's CSV column schema stays
statically explicit; a shared batch-insert utility
(`services/content_upload_service.process_csv_upload`) handles the common
mechanics (iteration, error isolation, response assembly) so the routes
themselves stay thin. See ADR 008.

**Uploaded rows default to `status=DRAFT`, not auto-approved.** A CSV
upload lands as unreviewed content; nothing is exposed to a
learner-facing `GET` (which filters to `approved` only) until explicitly
approved. See Section 8 for the approval mechanism that resolves this.

**`GET` endpoints accept an optional `status` filter, defaulting to
`approved`.** Backward-compatible with any future learner-facing caller.
A `status=all` sentinel exists specifically because the CMS itself needs
to see its own draft uploads to be reviewable — the approved-only default
alone would make the inventory tree unable to show what was just
uploaded, defeating the epic's own "verify what's been uploaded" goal.

**No authentication gates this epic.** Feature-flag-gated only, default
`false` — explicitly not a security boundary. See ADR 011.

**Navigation — two-tier sidebar, replacing the single-link stopgap.** A
second, narrower icon-only rail (`IconRail`) sits left of the existing
content sidebar. `AppShell` (epic 001) gained an optional `rail` slot and
a `sidebarCollapsed` prop that animates via CSS class toggle rather than
unmounting. Pressing the active view's rail icon collapses the sidebar;
pressing a different view's icon switches and re-expands. `view` and
`sidebarCollapsed` both live as local `App.jsx` state, following epic
001's "local state, not a router yet" approach. See ADR 010 — including
an open interaction-design gap (what the content sidebar should show
while the CMS view is active) left unresolved rather than silently
decided.

**Inventory tree data needs an adapter, not a direct feed.**
`CategoryTree` (epic 001, ADR 003) expects a generic
`{ id, label, labelJp, icon, count, total, complete }` shape.
`contentTreeAdapter.js` maps the three API response shapes into that
contract — using each line's actual Japanese-text field
(`character`/`word`/`pattern`) for `labelJp` since no separate label
exists in the data, and a single fixed icon per content line since no
per-item icon concept exists either. `complete` is defined as "all
entries in this category have `status=approved`" — an authoring concept,
distinct from the learner-facing mastery tracking still to be defined.

**Frontend flag is a `FEATURE_FLAGS` object property, not a Vite env
var**, matching epic 001's established convention (ADR 005) —
`FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT`. Backend keeps its existing
`.env`-backed Pydantic Settings approach.

---

## 3. Data Model

**Shared enums** (`models/content_status.py`)

```
ContentStatus: draft | suggested | approved
ContentSource: manual | llm_suggested
```

**`KanjiEntry`** — `character`, `meaning_en`, `onyomi`, `kunyomi`,
`compound_word`, `compound_reading`, `compound_meaning_en`, `category`
(indexed), `jlpt_level` (default `N5`), `status`, `source`, `created_at`.

**`VocabEntry`** — `word`, `reading`, `meaning_en`, `category` (indexed),
`jlpt_level` (default `N5`), `status`, `source`, `created_at`.

**`GrammarEntry`** — `pattern`, `meaning_en`, `example_jp`,
`example_reading`, `example_en`, `category` (indexed), `jlpt_level`
(default `N5`), `status`, `source`, `created_at`.

All three: UUID primary key, `status`/`source` via the shared
`content_status`/`content_source` Postgres enum types (created once,
referenced with `create_type=False` on the second and third tables —
autogenerate does not do this automatically and will fail with
`DuplicateObject` if the enum type creation isn't hand-corrected).

---

## 4. API Surface

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/kanji/upload` | CSV file (multipart) | `BatchUploadResponse` | Per-row partial success; rows default to `status=draft` |
| GET | `/api/v1/kanji` | `category?`, `status?` | `list[KanjiEntryRead]` | `status` defaults to `approved`; accepts `all` |
| PATCH | `/api/v1/kanji/{id}/status` | `ContentStatusUpdate` | `KanjiEntryRead` | Single-row status update; 404 if not found |
| POST | `/api/v1/vocab/upload` | CSV file (multipart) | `BatchUploadResponse` | Same as above |
| GET | `/api/v1/vocab` | `category?`, `status?` | `list[VocabEntryRead]` | Same as above |
| PATCH | `/api/v1/vocab/{id}/status` | `ContentStatusUpdate` | `VocabEntryRead` | Same as above |
| POST | `/api/v1/grammar/upload` | CSV file (multipart) | `BatchUploadResponse` | Same as above |
| GET | `/api/v1/grammar` | `category?`, `status?` | `list[GrammarEntryRead]` | Same as above |
| PATCH | `/api/v1/grammar/{id}/status` | `ContentStatusUpdate` | `GrammarEntryRead` | Same as above |

All nine absent from the API schema entirely when `FEATURE_CONTENT_MANAGEMENT`
is `false` — gated via a conditional `include_router` in `api/v1/router.py`,
not a per-route dependency check.

**`BatchUploadResponse`**
```
{
  results: [{ row: int, status: "success" | "error", error: string | null }],
  success_count: int,
  error_count: int
}
```
Row numbering starts at 1 for the first data row (header excluded).

**`ContentStatusUpdate`** (added post-epic — see Section 8)
```
{ status: "draft" | "suggested" | "approved" }
```
Shared across all three PATCH endpoints, single field.

---

## 5. Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `components/layouts/IconRail.jsx` | `components/layouts/` | Icon-only nav rail, one button per top-level view |
| `pages/ContentManagementPage.jsx` | `pages/` | Composes dropdown + upload + inventory tree |
| `components/cms/ContentLineDropdown.jsx` | `components/cms/` | Switches active content line |
| `components/cms/CsvUploadCard.jsx` | `components/cms/` | Drag-and-drop + click-to-browse upload, idle/dragging/uploading states |
| `components/cms/UploadResultsList.jsx` | `components/cms/` | Renders `BatchUploadResponse` — error rows only, plus aggregate counts |
| `utils/contentTreeAdapter.js` | `utils/` | Maps Kanji/Vocab/Grammar API responses into `CategoryTree`'s generic shape |

**Modified (from epic 001):**

| Component | Change |
|---|---|
| `components/layouts/AppShell.jsx` | Added optional `rail` slot, `sidebarCollapsed` prop — backward compatible, absent by default |
| `AppShell.module.css` | Added rail column layout, `.lineRail.collapsed` transition state |
| `App.jsx` | Added `view`/`sidebarCollapsed` state, `IconRail` rendering, view switch between study shell and `ContentManagementPage` |

`CategoryTree` (epic 001) reused directly via the adapter — no changes to
`CategoryTree` itself.

---

## 6. Decisions

Six architectural decisions were made in this epic, each recorded as a
standalone ADR:

- **ADR 006** — Kanji/Vocab/Grammar as separate dedicated tables
- **ADR 007** — Decoupled from Sentence Generator's `Item` table, duplication accepted
- **ADR 008** — Per-content-line route files instead of one parameterized route
- **ADR 009** — CSV upload commit strategy — per-row savepoints, single commit
- **ADR 010** — Two-tier sidebar / collapsible navigation, `AppShell` modification
- **ADR 011** — No auth, feature-flag-gated only — not a security boundary

---

## 7. Scaffold Fixes Discovered During This Epic

The backend scaffold had never been booted end-to-end before this epic
exercised it. Four latent gaps surfaced — none are epic 002 design
issues, all are prerequisites this epic happened to be first to hit:

- **Ruff config gaps** — import sorting/grouping rules (`I001`),
  `E402`/`RUF100` interactions, PEP 695 generic syntax (`UP047`), and
  `script.py.mako` itself generating non-compliant code on every future
  `alembic revision --autogenerate` (fixed at the template level, not
  just the one generated file).
- **Alembic `env.py`** referenced a prior project's models and a
  nonexistent `settings.DIRECT_URL` attribute — both artifacts of an
  unmodified template, fixed to import model registration from
  `app/models/__init__.py` instead of a hardcoded list, and to call
  `settings.resolved_migrations_url()`.
- **Circular import** — `database/base.py` originally imported models
  directly at module scope, which deadlocks the moment any route module
  imports a model *before* `base.py` has been imported standalone.
  Resolved by moving model registration to `app/models/__init__.py`,
  which has no reverse dependency on `base.py`.
- **Missing `__init__.py`** in `routes/`, `schemas/`, `services/`, and
  `seed_data/` — left them as implicit namespace packages, which broke
  multi-name imports (`from app.routes import grammar, kanji, vocab`).

---

## 8. Post-Epic Additions — Approval Endpoint & Seed Data

Two follow-ups landed after this epic was marked complete, on a small
dedicated branch (`fix/content-approval-and-seed-data`) rather than
folded into epic 003 — both address the same underlying gap: nothing
existed yet that made an approved, learner-visible row possible.

**Per-entry status update.** `PATCH /api/v1/{kanji,vocab,grammar}/{id}/status`
(`schemas/content_status_update.py`'s `ContentStatusUpdate`, one shared
schema for all three) lets a single entry's `ContentStatus` be changed
directly. Deliberately single-row, not bulk — there's no review UI
consuming this yet, so a bulk "approve all drafts" action would be
speculative. This closes the "no mechanism exists" half of the epic's
original approval-state open question (see Section 10) — a mechanism now
exists, though it's minimal and nothing currently calls it automatically.

**Initial N5 seed data.** `seed_data/seed_content.py`, run manually
(`uv run python -m app.seed_data.seed_content`), consumes
`kanji_seeds.py` (88 entries, 8 categories), `vocab_seeds.py` (~140
entries, 10 categories), and `grammar_seeds.py` (70+ patterns, 17
categories) — real, hand-curated N5 content, not placeholder data.
Inserted directly as `status=APPROVED`, `source=MANUAL`, bypassing the
CSV/draft/review flow entirely, since this is developer-authored data,
not something that needs review. Idempotent both within a single run (an
in-memory `seen` set per content line — `SessionLocal` uses
`autoflush=False`, so a DB-only existence check wouldn't catch
duplicates added earlier in the same run) and across repeated runs (DB
existence check by natural key: `character`/`word`/`pattern`).

Known gap in the seed data itself: `grammar_seeds.py` has no
`example_reading` values — every seeded Grammar entry's `example_reading`
is `NULL`. Not backfilled as part of this addition.

---

## 9. Planned Upgrades (future phases)

- **Unify `Item` with the study-line tables**, if duplication proves
  painful in practice — no usage data to justify a merge design yet
  (ADR 007).
- **Real access control** for the CMS, once auth exists project-wide —
  the feature flag is a visibility stopgap, not a security boundary
  (ADR 011).
- **CSV column-mismatch validation UX** (wrong column count, wrong
  header names) — this epic assumes well-formed CSVs; malformed
  structure beyond per-row data errors isn't specifically handled.
- **Replace local `view`/`sidebarCollapsed` state with real routing**,
  once a routing approach is chosen project-wide.
- **Parse error response bodies in `api.js`'s `request()` helper** — a
  422 from FastAPI validation currently surfaces only as a generic status
  code with no detail, which limits how useful `CsvUploadCard`'s error
  display can be. Not fixed in this epic since it would change behavior
  for every existing caller of `request()`, not just the new ones.
- **Build a review UI (or a bulk approve action)** that actually calls
  the `PATCH .../{id}/status` endpoint added in Section 8 — the endpoint
  exists, but nothing in the app currently uses it; draft rows still
  require manual DB edits or the seed script's direct-`approved` insert
  to become learner-visible.
- **Backfill `example_reading` for grammar seed data**, currently `NULL`
  across the board (Section 8).

---

## 10. Open Questions

- **Partially resolved — upload approval state.** CSV-uploaded rows
  still default to `status=draft`, not auto-approved. A mechanism to
  change that now exists (`PATCH .../{id}/status`, Section 8), but it's
  single-row only, with no bulk action and no review UI calling it yet —
  moving content from draft to approved is still a manual, one-row-at-a-
  time operation today.
- **Unresolved — content sidebar during CMS view.** The content
  sidebar currently still renders the (empty) study `CategoryTree` even
  while `view === "cms"`. Whether it should auto-collapse on entering
  the CMS view, or show something else, is a real gap flagged during
  implementation and deliberately left open (see ADR 010) rather than
  silently decided.
- **Still open — max upload size/row count.** Left to infrastructure
  limits for now; no explicit server-side cap.
- **Still open — should the CMS ever be reachable in production, or is
  flag-gated/dev-only the permanent posture?** Directly tied to ADR
  011's no-auth decision — this question can't be answered until real
  access control exists.
- **Still open — re-upload behavior for duplicate rows.** Whether
  re-uploading a CSV with an already-present `word`/`character`/`pattern`
  should update the existing row or skip it (matching the seed script's
  skip-on-duplicate behavior) — not addressed by this epic's upload
  logic, which currently just inserts every row as new.
