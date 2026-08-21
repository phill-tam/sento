# Epic 005 — Sentence Generator: AI Generation & Folders

**Status:** Complete (persistence later moved client-side by epic 013; AI provider layer later shared with epic 012 — see §8)
**Repo:** sento
**Scope:** Backend (FastAPI) + Frontend (React/Vite)
**Issue:** [#61](https://github.com/phill-tam/sento/issues/61)

---

## 1. Problem Statement

Flashcards (epic 003) and Quiz Mode (epic 004) both drill *isolated*
items — a kanji, a word, a pattern — but N5 learners need to see those
items used together in real sentences, and no such corpus existed in
the seed data. This epic adds an AI-backed generator: the learner picks
2–5 source items while browsing Study, configures a run (how many
sentences, an optional nuance), reviews the candidates one by one,
keeps the good ones, and files them into folders. Kept sentences are
persisted; discarded candidates never touch the database.

Issue #61's body was reconstructed after the fact from shipped code and
commit history — it previously had an empty body. This document is the
write-up that fills the `docs/epics/` gap.

---

## 2. Architecture Overview

**One environment switch, one place.** `get_provider()` (at this
epic's scope, inside `services/sentence_generation_service.py`) returns
a Gemini implementation when `settings.environment == "development"`
and a Claude implementation in `"production"`; routes and schemas never
learn which provider served a request. `SentenceProvider` is the
protocol both implementations satisfy. Adding a third provider meant
one more class plus one line in this function.

**`source_item_refs` is a raw JSONB list with no foreign key, on
purpose.** `GeneratedSentence.source_item_refs` stores
`[{line_id, item_id}]` because Kanji, Vocab and Grammar are three
separate dedicated tables (ADR 006) with no shared parent a single FK
could point at — see ADR 007
(`docs/adr/007-decoupled-from-sentence-generator-item.md`), this
epic's governing decision record. `POST /sentences/generate` resolves
those refs to real Japanese text before prompting the provider, and
404s on an unknown `line_id` or a missing row.

**Two distinct failure types map to two distinct HTTP responses.**
`SentenceGenerationRateLimitExceeded` → 429 with a structured
`SentenceGenerationError` body; `SentenceGenerationFailedError` → 502
with a plain string detail. The frontend's `RateLimitError` (a
dedicated `ApiError` subclass) keys off the 429 shape specifically so
the user sees a rate-limit message rather than a generic failure.

**Kept sentences survive a failed regenerate.** `useSentenceGenerator`
clears only `candidates` on a provider error and falls back to
`reviewing` if anything is already kept — nothing the user chose to
keep is ever lost to a provider failure mid-run.

**`folder_id = NULL` is a permanent, valid state**, meaning
Uncategorized rather than "pick a default folder." Folder deletion is
hard-blocked with a 409 while the folder still holds sentences,
enforced in the route itself regardless of what the frontend's
`ConfirmDialog` did first — the backend does not trust the frontend to
have confirmed correctly.

**The provider response is parsed defensively.** `_parse_candidates`
(`sentence_generation_service.py:44`) strips markdown code fences
before attempting a JSON parse, since providers occasionally wrap JSON
output in a ```` ```json ```` block despite the prompt asking for raw
JSON.

---

## 3. Data Model

### `SentenceFolder` (`backend/app/models/sentence_folder.py`)

A user-defined folder for organizing kept sentences. Deletion is
blocked (409) while it still holds sentences.

### `GeneratedSentence` (`backend/app/models/sentence_entry.py`)

| column | notes |
|---|---|
| `folder_id` | nullable, FK → `sentence_folders.id`, `ondelete="RESTRICT"` — `NULL` means Uncategorized, permanently |
| `source_item_refs` | raw JSONB `[{line_id, item_id}]`, no FK (ADR 007) |
| `jp_text`, `reading`, `meaning_en` | the generated sentence and its translation |

---

## 4. API Surface

| method | path | description |
|---|---|---|
| `GET`/`POST`/`PATCH`/`DELETE` | `/sentence-folders` | Folder CRUD; delete 409s while the folder holds sentences |
| `POST` | `/sentences/generate` | Resolves `source_item_refs` to real Japanese text, prompts the active provider, returns candidates (never persisted) |
| `POST` | `/sentences` | Saves kept candidates |
| `GET` | `/sentences` | Optional `folder_id` filter |
| `PATCH` | `/sentences/{id}` | Relocate to a different folder (or `null`) |
| `DELETE` | `/sentences/{id}` | Delete a saved sentence |

At this epic's scope, all of the above were gated together behind a
single backend flag, `FEATURE_SENTENCE_GENERATOR` — with it off, the
routes were absent from the OpenAPI schema entirely (registration
skipped in `api/v1/router.py`), not merely 403'd. See §8 for how this
gate's shape was later inherited by a different flag.

---

## 5. Frontend Components

| Component | Purpose |
|---|---|
| `hooks/useSentenceGenerator.js` | `idle → generating → reviewing` run state machine; ephemeral candidates carry a client-only `_tempId` |
| `components/generator/SentenceFolderTree.jsx` | Folder navigation |
| `components/generator/SentenceList.jsx` / `SentenceListItem.jsx` | Saved-sentence browsing within a folder |
| `components/generator/GenerateConfigForm.jsx` | Sentence count + optional nuance input, starts a run |
| `components/generator/SentenceReviewPanel.jsx` | Candidate-by-candidate keep/discard review |
| `pages/GeneratePage.jsx` | Wires browsing / configuring / generating / reviewing phases together |
| `components/layouts/ModeToggle.jsx` | Gained a generator-selecting phase — `Continue (n/5)` with pending/ready states |
| `App.jsx` | Lifts `generatorWorkflowPhase`, `generatorSelectedIds`, `generatorSourceItemRefs`, folders, and sentences; the `generate` view + `✧` rail button |
| `src/api.js` | Folder + sentence client functions; `request()` gained 204 handling and typed errors; `RateLimitError` added as a distinct `ApiError` subclass |

---

## 6. Decisions

- **The provider switch is the only place that branches on
  environment.** Keeping `get_provider()` as the single decision point
  means routes and schemas stay provider-agnostic.
- **Two distinct failure types, two distinct HTTP responses** (§2) —
  this is what lets the frontend distinguish "you're rate-limited" from
  "something broke" without inspecting response bodies ad hoc.
- **`source_item_refs` is traceability only**, with no FK, because of
  the three-separate-tables shape ADR 006/007 chose deliberately. Epic
  006 later gave this same field a second job — resolving a sentence's
  quiz distractors — without changing its shape.
- **Folder deletion is enforced server-side**, not just guarded in the
  UI — a 409 fires regardless of what `ConfirmDialog` did first.

---

## 7. Notable Implementation Details

- The backend flag gated **route registration**, not just request
  handling — with `FEATURE_SENTENCE_GENERATOR` off, `/sentences` and
  `/sentence-folders` did not appear in the OpenAPI schema at all.
- `settings.py` reads `environment`, `gemini_api_key`/`GEMINI_API_KEY`,
  `gemini_model`, `anthropic_api_key`/`ANTHROPIC_API_KEY`,
  `anthropic_model` — none of these were documented in
  `backend/.env.example` at the time this epic shipped (they are now —
  see §8).
- A StrictMode double-invocation bug in `setKeptSentences` was found
  and fixed during this epic — an early instance of the class of bug
  epic 015 would later hit again with `recordRun`'s `useRef` latch.

---

## 8. Extended by Later Epics

**Epic 012 (Word Pairs) extracted the provider layer into its own
module.** `get_provider()`, the `AiProvider` protocol, and the
`AiProviderRateLimitExceeded`/`AiProviderFailedError` exception types
(renamed off "SentenceGeneration" since they're no longer
sentence-specific) now live in `backend/app/services/ai_provider.py`,
shared by this epic's `sentence_generation_service.py` and epic 012's
`answer_grading_service.py`. Confirmed in current code:
`sentence_generation_service.py` still owns its own `_build_prompt`
and `_parse_candidates` (lines 13 and 44) and imports `get_provider`
from `ai_provider` rather than defining it — exactly the "both callers
own their own prompt-building and response-parsing" split CLAUDE.md
describes. See `docs/epics/012-pair-writing-quiz.md` for the full
extraction.

**Epic 006 (Global Quiz) reused `source_item_refs` for distractor
resolution** — a saved sentence's quiz distractors are drawn from its
own source items rather than arbitrary other sentences. See
`docs/epics/006-global-quiz.md`.

**Epic 013 (Local Sentence Storage) moved sentence persistence out of
the database and into the browser.** The `FEATURE_SENTENCE_GENERATOR`
flag described above no longer exists — confirmed via
`grep -rn "FEATURE_SENTENCE_GENERATOR" backend/ frontend/src/`, which
returns nothing in tracked files. Its shape (gating whether the
persistence routes are even registered) was inherited by
`SENTENCE_PERSISTENCE_ENABLED`, which today gates a separate
`persistence_router` in `backend/app/routes/sentences.py` and all of
`sentence_folders.py`, defaulting to `False`. `POST /sentences/generate`
stays unconditionally mounted regardless of that flag — generation
never moved client-side, since it needs a provider key. See
`docs/epics/013-local-sentence-storage.md` for the full story and
`docs/adr/019-browser-is-store-of-record-for-anonymous-sentences.md`.
The `SentenceFolder`/`GeneratedSentence` tables and their Alembic
history are untouched and reserved for the auth epic.

---

## 9. Open Questions

Carried over from issue #61's "Known open items, not blocking":

- **The source-item picker is Study-page-only.**
  `handleGeneratorClick` force-switches `view` to `study`, and
  `handleContinueGenerator` stamps every ref with a single
  `activeLineId` — a run's sources can't span content lines, even
  though epic 006's quiz selection can.
- **`GenerateConfigForm` is always passed `isGenerating={false}`** by
  `GeneratePage`, so its in-flight state never renders.
- **Regenerate reuses `generator.candidates.length || 1` as the count
  and drops the nuance**, rather than the original run's parameters.
- **`useSentenceGenerator.resetRun` is exported but never called.**
- **`generatorFolderCounts` in `App.jsx` reports `1` for every
  non-active folder** — a placeholder, not a real count, since only
  the active folder's sentences are loaded.
- **No auth.** Generation costs real provider quota and any reachable
  client can spend it (ADR 011) — unchanged since, and explicitly the
  subject of ADR 018 once epic 012 added a second AI-backed endpoint
  sharing the same quota.
