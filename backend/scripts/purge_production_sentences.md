# Runbook — purging the production sentence rows (epic 013 phase 5)

One-off. Production only. The only irreversible step in epic
[#128](https://github.com/phill-tam/sento/issues/128).

This is a **manual** procedure by design. It is not an Alembic revision,
because a revision containing `DELETE FROM generated_sentences` would run
wherever `alembic upgrade head` runs — including every developer's local
database, which this epic promised to leave alone. A migration cannot say
"production only"; a person can.

## What it deletes and why

Every row of `generated_sentences` and every row of `sentence_folders`.

Until epic 013 these tables had no owner column, and the endpoints that
wrote them had no authentication, so every row belongs to nobody in
particular and is readable, movable and deletable by any visitor. The
tables are being reserved for signed-in users. Rows that predate an owner
cannot be given one, and folders holding no sentences are names with
nothing behind them, so both go.

**No schema is touched.** Tables, columns, indexes and Alembic history
all stay exactly as they are — the auth epic adds `user_id` on top of
them.

## Order of operations

**Deploy [#145](https://github.com/phill-tam/sento/pull/145) first.** It
unmounts the endpoints that write these tables. Purge before the deploy
lands and the live frontend spends the gap reading a table it still
believes in — and anyone who still has the old client can write new rows
into the table you just emptied.

```
#145 deployed  →  dump  →  verify dump  →  purge  →  verify empty
```

## 1. Confirm the target

```bash
psql "$PRODUCTION_DATABASE_URL" -c "SELECT current_database(), current_user, inet_server_addr();"
```

Supabase note: use the **direct** connection, not the transaction pooler.
Interactive transactions and `pg_dump` both want the non-pooled port.

## 2. Dump both tables

```bash
pg_dump "$PRODUCTION_DATABASE_URL" \
  --data-only \
  --table=public.generated_sentences \
  --table=public.sentence_folders \
  --file="sentences-backup-$(date +%Y%m%d-%H%M%S).sql"
```

Then **verify the dump is real** before deleting anything — an empty or
truncated dump file is worse than no dump, because it looks like a safety
net:

```bash
grep -c "^INSERT\|^COPY" sentences-backup-*.sql
tail -5 sentences-backup-*.sql
```

Store it somewhere that is not the machine you are about to run the
delete from.

## 3. Purge

```bash
psql "$PRODUCTION_DATABASE_URL" -f backend/scripts/purge_production_sentences.sql
```

The script opens a transaction, prints the before-counts, deletes
sentences then folders (that order is forced — the FK is
`ON DELETE RESTRICT`), and prints the after-counts. **It does not
commit.** Read the counts, then type `COMMIT;` or `ROLLBACK;` yourself.

Leaving the session without typing either rolls back.

## 4. Verify

```bash
psql "$PRODUCTION_DATABASE_URL" -c "SELECT count(*) FROM generated_sentences;"
psql "$PRODUCTION_DATABASE_URL" -c "SELECT count(*) FROM sentence_folders;"
```

Both `0`. Then load the deployed app and confirm the generator still
works end to end: generate, keep, save, reload, and the saved sentences
come back — from the browser, with no request to `/api/v1/sentences`.

## If something goes wrong

- **Counts are not both 0 after the deletes** — something wrote between
  the delete and the check. `ROLLBACK`, find what still has credentials
  (an un-deployed instance, a local client pointed at production), then
  start again.
- **You committed and want the data back** — restore from the dump:
  `psql "$PRODUCTION_DATABASE_URL" -f sentences-backup-<stamp>.sql`.
  Insert folders before sentences, or the FK rejects them; the
  `--data-only` dump preserves table order, so restoring the file whole
  is the reliable path.
- **`DELETE` blocks or times out** — an open transaction elsewhere holds
  a lock. Find it in `pg_stat_activity` rather than raising the timeout.

## Local databases

Nothing here runs against local development. If you want a clean local
slate, delete the rows yourself against your own `DATABASE_URL` — but
note that with `SENTENCE_PERSISTENCE_ENABLED=False` (the default) the app
does not read these tables at all, so local rows are inert either way.
