# ADR 008 — Separate Route Files Per Content Line, Not One Parameterized Route

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

Six endpoints were needed: upload + list, for each of Kanji, Vocabulary,
and Grammar. A single parameterized route
(`POST /content/{line}/upload`, `GET /content/{line}`) was considered as
a way to avoid writing three near-identical route files.

## Decision

Three separate route modules — `routes/kanji.py`, `routes/vocab.py`,
`routes/grammar.py` — each with its own `POST /{line}/upload` and
`GET /{line}` routes, its own row-parser function
(`_parse_kanji_row`, `_parse_vocab_row`, `_parse_grammar_row`), sharing a
single generic batch-insert utility,
`services/content_upload_service.process_csv_upload` (see ADR 009).

## Consequences

**Positive:**
- Each line's expected CSV columns and required fields are statically
  explicit in that line's own file — reading `routes/kanji.py` shows
  exactly what a Kanji CSV needs, with no dynamic dispatch to trace
  through.
- Type-checking and IDE navigation work normally — no `getattr`-style
  dynamic model/field lookup based on a runtime `line` string.
- Adding a fourth content line in a future epic means adding a fourth
  file following an established pattern, not modifying a shared
  parameterized function's internal branching.

**Negative:**
- Three files with structurally similar shape (each importing its model,
  its schema, defining a row parser, an upload route, and a list route) —
  more total lines of code than one parameterized route would produce.
- A change to the shared upload/list pattern itself (e.g. adding a new
  common query param) must be applied to three files, not one — though in
  practice this already happened once (the `status=all` query param
  addition) and required near-identical three-file edits.

## Alternatives Considered

**Single parameterized route, `/content/{line}/upload` and
`/content/{line}`.** Rejected — the doc's own reasoning holds: a single
route would still need per-line CSV column validation and model dispatch
internally, so it doesn't eliminate the three-way branch, it just hides it
inside one function's `if line == "kanji": ... elif line == "vocab":
...` instead of three files. That's arguably worse for readability, not
better, since the branch becomes implicit in behavior rather than
explicit in file structure.