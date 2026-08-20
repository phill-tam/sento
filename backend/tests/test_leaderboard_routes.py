"""Route-level coverage for POST/GET /leaderboard (epic 015).

Deliberately thin — the business logic is already covered against a
real Postgres in test_leaderboard_service.py. What belongs here is
what only the route can prove: that the endpoint is actually mounted
(unconditionally, unlike admin_router/persistence_router — ADR 021),
that the request/response schemas serialise correctly over real JSON,
and that invalid input is rejected with a 422 before it ever reaches
the service.
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient


def make_body(**overrides):
    defaults = {
        "device_id": str(uuid4()),
        "display_name": "Phil",
        "runs": [
            {
                "id": str(uuid4()),
                "quiz_type": "choice",
                "score": 8,
                "total": 10,
                "completed_at": datetime.now(UTC).isoformat(),
            }
        ],
    }
    return {**defaults, **overrides}


def test_submit_then_read_round_trips_over_real_json(client: TestClient):
    body = make_body(display_name="Phil")

    submit = client.post("/api/v1/leaderboard", json=body)
    assert submit.status_code == 200
    assert submit.json()["accepted_runs"] == 1

    board = client.get("/api/v1/leaderboard")
    assert board.status_code == 200
    entries = board.json()["entries"]
    assert entries == [
        {
            "device_hash": submit.json()["device_hash"],
            "display_name": "Phil",
            "total_score": 8,
        }
    ]


def test_a_score_greater_than_total_is_rejected_before_reaching_the_service(
    client: TestClient,
):
    body = make_body()
    body["runs"][0]["score"] = 999

    response = client.post("/api/v1/leaderboard", json=body)

    assert response.status_code == 422


def test_a_display_name_over_the_length_cap_is_rejected(client: TestClient):
    body = make_body(display_name="a" * 21)

    response = client.post("/api/v1/leaderboard", json=body)

    assert response.status_code == 422


def test_more_runs_than_the_submission_cap_is_rejected(client: TestClient):
    one_run = make_body()["runs"][0]
    body = make_body(runs=[{**one_run, "id": str(uuid4())} for _ in range(201)])

    response = client.post("/api/v1/leaderboard", json=body)

    assert response.status_code == 422
