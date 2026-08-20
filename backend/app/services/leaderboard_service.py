"""Business logic for the anonymous leaderboard (epic 015, ADR 021).

Two different upsert shapes, deliberately. A device's display_name is
DO UPDATE — a resubmission under a new name is a rename, and the
endpoint has no other way to change one. A run row is DO NOTHING — a run
is a historical fact, created once client-side and never edited, so
resubmitting an existing run id is a no-op rather than a correction.
This is also what keeps a later, possibly fabricated resubmission from
silently overwriting an earlier genuine one under the same id: whichever
submission reaches the id first wins it permanently.

The board itself is never a stored or incremented value — SUM(score)
GROUP BY device, computed fresh on every read (ADR 021).
"""

import hashlib
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.leaderboard_device import LeaderboardDevice
from app.models.leaderboard_run import LeaderboardQuizType, LeaderboardRun
from app.schemas.leaderboard import (
    LeaderboardEntry,
    LeaderboardResponse,
    SubmitLeaderboardRequest,
    SubmitLeaderboardResponse,
)

# Truncation length for the public board discriminator (ADR 021). Short
# enough to read as a tag rather than an id. Collisions are accepted as
# a display concern, not a correctness one — the same property Discord's
# old #1234 discriminator had within one username.
DEVICE_HASH_LENGTH = 4


def _hash_device_id(device_id: UUID) -> str:
    """One-way and never invertible back to device_id — the property
    that makes it safe to publish on a public board when the raw id
    itself functions as a bearer credential (ADR 021). Never derived
    from a slice of the id itself, for the same reason."""
    return hashlib.sha256(str(device_id).encode()).hexdigest()[:DEVICE_HASH_LENGTH]


def submit_runs(db: Session, payload: SubmitLeaderboardRequest) -> SubmitLeaderboardResponse:
    """Upserts a device's display name and a batch of runs, then returns
    the device's post-submission cumulative score.

    `payload.runs` may be empty — a submission that only changes the
    display name is a legitimate call, not an error.
    """
    device_stmt = (
        insert(LeaderboardDevice)
        .values(id=payload.device_id, display_name=payload.display_name)
        .on_conflict_do_update(
            index_elements=[LeaderboardDevice.id],
            set_={"display_name": payload.display_name},
        )
    )
    db.execute(device_stmt)

    accepted_runs = 0
    if payload.runs:
        run_rows = [
            {
                "id": run.id,
                "device_id": payload.device_id,
                "quiz_type": LeaderboardQuizType(run.quiz_type),
                "score": run.score,
                "total": run.total,
                "completed_at": run.completed_at,
            }
            for run in payload.runs
        ]
        run_stmt = (
            insert(LeaderboardRun)
            .values(run_rows)
            .on_conflict_do_nothing(index_elements=[LeaderboardRun.id])
            .returning(LeaderboardRun.id)
        )
        result = db.execute(run_stmt)
        # NOT result.rowcount — tried first, and wrong: psycopg reports
        # -1 (unknown) for this statement shape rather than the actual
        # insert count, caught by a manual smoke test before any
        # automated test could hide behind an unverified assumption.
        # RETURNING only yields rows that were actually written — a row
        # skipped by DO NOTHING never appears — so counting what comes
        # back is the reliable way to know how many of the batch were
        # new.
        accepted_runs = len(result.fetchall())

    db.commit()

    total_score = db.scalar(
        select(func.coalesce(func.sum(LeaderboardRun.score), 0)).where(
            LeaderboardRun.device_id == payload.device_id
        )
    )

    return SubmitLeaderboardResponse(
        accepted_runs=accepted_runs,
        total_score=total_score,
        device_hash=_hash_device_id(payload.device_id),
    )


def get_leaderboard(db: Session) -> LeaderboardResponse:
    """The board itself. Inner join, not left join with a zero
    fallback — a device that has set a name but never submitted a run
    has no meaningful cumulative score yet and should not appear as a
    0-point entry. No pagination; see epic 015's open questions."""
    rows = db.execute(
        select(
            LeaderboardDevice.id,
            LeaderboardDevice.display_name,
            func.sum(LeaderboardRun.score).label("total_score"),
        )
        .join(LeaderboardRun, LeaderboardRun.device_id == LeaderboardDevice.id)
        .group_by(LeaderboardDevice.id, LeaderboardDevice.display_name)
        .order_by(func.sum(LeaderboardRun.score).desc(), LeaderboardDevice.id)
    ).all()

    entries = [
        LeaderboardEntry(
            device_hash=_hash_device_id(row.id),
            display_name=row.display_name,
            total_score=row.total_score,
        )
        for row in rows
    ]
    return LeaderboardResponse(entries=entries)
