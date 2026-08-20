"""Shared fixtures for tests that exercise a real request/DB path.

Every backend test before epic 015 was a pure-function unit test —
`test_answer_grading_service.py` and `test_pair_writing_schemas.py`
never open a session or a request, by design (see their own docstrings).
`backend-ci.yml` has provisioned a Postgres 16 service and run
`alembic upgrade head` against it since this project's CI was written,
but nothing has ever queried it: the service being provisioned is not
the same as anything using it. This file is what starts using it, and
it is deliberately its own file rather than something invented inline
inside the first feature test that happened to need it.

Migrations are assumed already applied — `uv run alembic upgrade head`
locally, the CI step of the same name in CI — matching how every other
environment this project runs in works. Nothing here calls
`Base.metadata.create_all`; a model with no migration has no table
under it here exactly as it would in dev or prod.

Isolation is one real transaction per test, with application code's own
`db.commit()` calls made harmless rather than skipped. A naive version
of this fixture — open a connection, `connection.begin()`, bind a
session to the connection, roll back at the end — breaks the moment
code under test calls `session.commit()`: a Session bound straight to a
Connection that already has a transaction open adopts that transaction
as its own, so commit() ends it for real, and the rollback at teardown
has nothing left to undo. `content_upload_service.py` already commits
this way (`db.commit()` after its per-row `db.begin_nested()` calls), so
this had to be handled here rather than discovered by the first test
that hit it.

The fix is the pattern SQLAlchemy's own docs give for this exact
problem: start a SAVEPOINT (`session.begin_nested()`) as the session's
working transaction, and listen for it ending. Application code calling
`db.commit()` only releases that SAVEPOINT; the listener immediately
opens a new one in its place, so nothing application code does can ever
reach the real outer transaction. Nested `db.begin_nested()` calls from
the CSV upload path stack SAVEPOINTs the same way they do outside tests
and are unaffected. Only this fixture's own `transaction.rollback()` at
teardown ends the outer transaction, which discards everything.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

from app.database.session import engine, get_db
from app.main import app


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()

    TestSessionLocal = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = TestSessionLocal()
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session: Session, trans) -> None:
        # Fires whenever a transaction on this session ends, including a
        # SAVEPOINT released by application code's own db.commit(). Only
        # reopen for that case — trans.nested is the SAVEPOINT itself,
        # and its parent not being nested means the SAVEPOINT just ended
        # rather than the outer real transaction.
        if trans.nested and not trans._parent.nested:
            session.begin_nested()

    try:
        yield session
    finally:
        session.close()
        # Ends the real transaction regardless of how many SAVEPOINTs
        # application code opened and released inside it — nothing
        # committed here was ever visible outside this connection.
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        # Cleared explicitly — dependency_overrides lives on the
        # singleton app instance, so a test that forgot this would leak
        # its override into every test that runs after it in the same
        # process.
        del app.dependency_overrides[get_db]
