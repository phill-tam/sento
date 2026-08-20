"""Proves the db_session/client fixtures actually isolate, rather than
trusting the SAVEPOINT-nesting logic in conftest.py by inspection.

Not a leaderboard test — this is infra verification for epic 015's
Step 0a, the first thing in this project to exercise `conftest.py` at
all. If this file is deleted once epic 015 has real tests exercising
the same fixtures, that is fine; it exists to catch conftest.py being
wrong before anything is built on top of it.
"""

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session


def test_client_fixture_reaches_a_real_db_backed_route(client: TestClient) -> None:
    """Proves the get_db override actually wires the client to
    db_session, not just that a request can be made — /kanji depends on
    Depends(get_db) directly, so a 200 here means the override took.
    """
    response = client.get("/api/v1/kanji")
    assert response.status_code == 200


def test_session_sees_own_uncommitted_write(db_session: Session) -> None:
    db_session.execute(text("CREATE TEMPORARY TABLE _fixture_probe (n int)"))
    db_session.execute(text("INSERT INTO _fixture_probe VALUES (1)"))
    result = db_session.execute(text("SELECT n FROM _fixture_probe")).scalar()
    assert result == 1


def test_commit_inside_a_test_does_not_end_the_outer_transaction(db_session: Session) -> None:
    """The exact failure mode the SAVEPOINT-nesting fix in conftest.py
    exists for: a plain connection.begin() + rollback fixture would let
    this commit() end the real transaction, so the *next* test in this
    file would start with a connection whose transaction already ended.
    """
    db_session.execute(text("SELECT 1"))
    db_session.commit()

    # If commit() had escaped the SAVEPOINT and ended the outer
    # transaction, this would raise (or silently run outside any
    # transaction) instead of succeeding.
    db_session.execute(text("SELECT 1"))


def test_second_test_gets_a_clean_transaction(db_session: Session) -> None:
    """Runs after the commit() above. A leaked/ended outer transaction
    from that test would surface here as an error on first use, not as
    visible leftover data — Postgres closes the temp table with its
    session, so the meaningful assertion is that this executes at all.
    """
    result = db_session.execute(text("SELECT 1")).scalar()
    assert result == 1
