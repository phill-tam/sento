from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.leaderboard import (
    LeaderboardResponse,
    SubmitLeaderboardRequest,
    SubmitLeaderboardResponse,
)
from app.services.leaderboard_service import get_leaderboard, submit_runs

# Mounted unconditionally in api/v1/router.py, unlike the settings-gated
# admin_router and persistence_router beside it there. Both of those
# gates are access control standing in for auth this project doesn't
# have yet, default off, meant to be flipped on only by whoever is the
# sole reachable caller (ADR 011, ADR 012) — an interim posture waiting
# to be replaced. This endpoint doesn't fit that shape: there is no
# state in which public reachability is a mistake to gate against, since
# public reachability is the entire feature (ADR 021).
router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.post("", response_model=SubmitLeaderboardResponse)
def submit_leaderboard_runs(
    payload: SubmitLeaderboardRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SubmitLeaderboardResponse:
    return submit_runs(db, payload)


@router.get("", response_model=LeaderboardResponse)
def read_leaderboard(db: Annotated[Session, Depends(get_db)]) -> LeaderboardResponse:
    return get_leaderboard(db)
