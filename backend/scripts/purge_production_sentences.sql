-- Epic 013 phase 5 — purge the production sentence and folder rows.
--
-- MANUAL. PRODUCTION ONLY. RUN INTERACTIVELY. NOT AN ALEMBIC REVISION.
--
-- Why this is not a migration: a revision containing DELETE FROM
-- generated_sentences would run wherever `alembic upgrade head` runs,
-- which includes every developer's local database. Epic 013 deletes the
-- production rows and explicitly leaves local data alone, and a revision
-- cannot express that distinction. So this stays a script somebody runs
-- on purpose, once, against one database.
--
-- Why the rows go at all: until epic 013 these tables had no owner
-- column and no authentication in front of the endpoints that wrote
-- them, so every row belongs to nobody in particular and is visible to
-- everybody. The tables are being reserved for signed-in users; the auth
-- epic adds user_id and turns the endpoints back on. Rows that predate
-- an owner cannot be assigned one.
--
-- BEFORE YOU RUN THIS
--
--   1. #145 must already be DEPLOYED. It unmounts the endpoints that
--      write these tables. Purging first leaves the deployed frontend
--      reading a table it still believes in until the deploy lands.
--   2. Take the dump — see purge_production_sentences.md. The deletion
--      is irreversible and the dump costs nothing.
--   3. Confirm your connection really is production and really is the
--      database you mean:
--        SELECT current_database(), current_user, inet_server_addr();
--
-- HOW TO RUN
--
--   psql "$PRODUCTION_DATABASE_URL" -f purge_production_sentences.sql
--
-- The final COMMIT is deliberately left commented out, so piping this
-- file into psql cannot complete the deletion on its own. Read the
-- counts, then type COMMIT (or ROLLBACK) yourself.

BEGIN;

-- (1) What is about to be deleted. Write these numbers down — they are
-- the only record of what was there once the transaction commits.
SELECT 'generated_sentences' AS table_name, count(*) AS rows_before FROM generated_sentences
UNION ALL
SELECT 'sentence_folders', count(*) FROM sentence_folders;

-- (2) Sentences first, folders second. generated_sentences.folder_id is
-- ON DELETE RESTRICT, so the reverse order fails on any folder that
-- still holds a sentence. This ordering is a constraint, not a
-- preference.
DELETE FROM generated_sentences;
DELETE FROM sentence_folders;

-- (3) Both must read 0. If either does not, something wrote between
-- steps 2 and 3 — ROLLBACK and find out what still has credentials
-- before trying again.
SELECT 'generated_sentences' AS table_name, count(*) AS rows_after FROM generated_sentences
UNION ALL
SELECT 'sentence_folders', count(*) FROM sentence_folders;

-- (4) Then, by hand:
--
--   COMMIT;     -- if the counts above are both 0
--   ROLLBACK;   -- for anything else
--
-- Leaving the session without typing either rolls back, which is the
-- safe default and the reason this line stays commented.
--
-- COMMIT;
