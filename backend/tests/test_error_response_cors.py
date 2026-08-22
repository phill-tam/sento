"""Proves a 500 still carries CORS headers.

The bug this guards against is invisible from the server side — the
response is a 500 either way, and only a browser notices the missing
`Access-Control-Allow-Origin`. So the assertion has to be on the header
specifically, not on the status.

Needs its own client rather than conftest's: `TestClient` re-raises
server exceptions by default, which is the right behaviour everywhere
else and exactly wrong here, where the response to a failed request *is*
the thing under test.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.main import app
from app.routes import leaderboard

ORIGIN = "https://sentou.vercel.app"


@pytest.fixture()
def error_returning_client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        del app.dependency_overrides[get_db]


def test_an_unhandled_error_still_gets_cors_headers(
    error_returning_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The production symptom: a missing table made this 500, and the
    browser reported a CORS failure against an origin that was already
    allowlisted, hiding the real error."""
    monkeypatch.setattr(
        leaderboard,
        "get_leaderboard",
        lambda db: (_ for _ in ()).throw(RuntimeError("relation does not exist")),
    )

    response = error_returning_client.get(
        "/api/v1/leaderboard", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == ORIGIN


def test_the_error_body_is_json_rather_than_bare_text(
    error_returning_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ServerErrorMiddleware's default is `text/plain`, which api.js's
    request() cannot parse — it falls back to a null body and loses even
    the status detail. A JSON body keeps the client's error path
    working."""
    monkeypatch.setattr(
        leaderboard,
        "get_leaderboard",
        lambda db: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    response = error_returning_client.get(
        "/api/v1/leaderboard", headers={"Origin": ORIGIN}
    )

    assert response.json() == {"detail": "Internal Server Error"}


def test_a_successful_response_is_unaffected(
    error_returning_client: TestClient,
) -> None:
    """Guards the ordering from being 'fixed' by moving CORS inside,
    which would leave this passing and the 500 case broken — so it is
    here to be paired with the first test, not to stand alone."""
    response = error_returning_client.get(
        "/api/v1/leaderboard", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN


def test_an_unlisted_origin_is_still_refused(
    error_returning_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Catching errors below CORS must not turn into allowing everything
    on the error path — the header is only added for an allowed origin,
    same as any other response."""
    monkeypatch.setattr(
        leaderboard,
        "get_leaderboard",
        lambda db: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    response = error_returning_client.get(
        "/api/v1/leaderboard", headers={"Origin": "https://not-sento.example"}
    )

    assert response.status_code == 500
    assert "access-control-allow-origin" not in response.headers
