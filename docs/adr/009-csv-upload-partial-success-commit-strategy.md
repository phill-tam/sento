# ADR 009 — CSV Upload: Per-Row Savepoints with a Single Commit

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

CSV batch upload needs partial-success semantics: a 200-row file with 3
malformed rows should still save the other 197, with per-row success/error
reporting (`BatchUploadResponse`). Two distinct failure modes had to be
handled differently:

1. **Validation-phase errors** (a row parser rejects malformed data before
   touching the database) — cheap to isolate, nothing to roll back.
2. **Insert-phase errors** (a DB-level constraint violation SQLAlchemy
   only discovers on flush) — without isolation, a single failed insert
   poisons the entire session (`InvalidRequestError` on every subsequent
   operation), silently killing every row after the failure point.

Once row-level isolation was settled (via `db.begin_nested()` — a
savepoint per row, released on success or rolled back on failure without
affecting the outer transaction), a second question remained: commit once
after the full loop, or commit after each successful row.

## Decision

**Per-row savepoints, single `db.commit()` after the loop completes** —
implemented in `services/content_upload_service.process_csv_upload`.

Each row: open a savepoint (`db.begin_nested()`), attempt to build and
`db.add()` the row via the caller-supplied `row_parser`, either let the
savepoint release (success) or catch the exception and let it roll back
(failure) — then continue to the next row regardless. After all rows are
processed, one `db.commit()` persists every successfully-staged row at
once.

## Consequences

**Positive:**
- One database round-trip for the commit itself, regardless of batch
  size — efficient for what's fundamentally a single fast HTTP request,
  not a long-running job.
- Partial-success semantics are fully preserved: a bad row's savepoint
  rollback doesn't affect any other row's staged insert.

**Negative:**
- If the server process crashes *during* the loop (after some rows have
  passed their savepoint but before the final commit), the entire batch
  is lost — including rows that individually succeeded. This is an
  accepted trade-off, not an oversight: CSV uploads here are single HTTP
  requests completing in well under a second, not multi-minute batch
  jobs where mid-process crashes are a realistic operational concern.
- A caller can't currently observe partial progress mid-upload (e.g. a
  progress bar showing "120 of 200 processed") — the response is
  all-or-nothing in terms of *timing*, even though it's partial in terms
  of *outcome*.

## Alternatives Considered

**Commit after each successful row.** Rejected — trades a real but
currently-irrelevant benefit (crash-survivability of already-processed
rows) for 200x the commit overhead on every upload, for an authoring tool
where uploads are small, fast, interactive requests, not background jobs.
Revisit if upload volume or file size grows to a point where mid-batch
crash risk becomes non-negligible.

**No savepoints — plain try/except around `db.add()`.** Rejected outright,
not just as a trade-off — this doesn't actually work. A failed flush
poisons the whole SQLAlchemy session, so every row after the first
failure would raise `InvalidRequestError` regardless of the surrounding
try/except, silently breaking the partial-success requirement itself.