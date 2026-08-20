from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

# Mirrors scoreStore.js's own MAX_RUNS cap. A submission is the client's
# whole capped history resubmitted wholesale (ADR 021), never more than
# what the client itself could ever hold, so the request can never be
# larger than that regardless of what a caller sends.
MAX_RUNS_PER_SUBMISSION = 200

# Mirrors identityStore.js's MAX_DISPLAY_NAME_LENGTH.
MAX_DISPLAY_NAME_LENGTH = 20


class LeaderboardRunSubmission(BaseModel):
    """One run from the client's scoreStore history.

    `id` is the run's own id, not server-generated — see
    LeaderboardRun's docstring for why that's what makes submission
    idempotent.
    """

    id: UUID
    quiz_type: Literal["choice", "pairs"]
    score: int = Field(ge=0)
    total: int = Field(ge=0)
    completed_at: datetime

    @model_validator(mode="after")
    def _score_within_total(self) -> "LeaderboardRunSubmission":
        # Input hygiene, not a security control — ADR 021 already accepts
        # that a submitted score is unverifiable. This only catches a
        # malformed payload before it can skew the aggregate, the same
        # role MAX_ANSWER_LENGTH plays in pair_writing.py.
        if self.score > self.total:
            raise ValueError(f"score ({self.score}) cannot exceed total ({self.total})")
        return self


class SubmitLeaderboardRequest(BaseModel):
    """Request body for POST /leaderboard.

    `device_id` travels in the body rather than a header or path segment
    — there is no auth layer in this project to carry it, and every
    other write endpoint here (generate, grade) already puts its whole
    payload in the body, so this follows the same shape rather than
    inventing a header convention for one endpoint.

    The client resubmits its whole (capped) history on every sync rather
    than tracking what it already sent (ADR 021) — idempotent by each
    run's own id, so resending an already-stored run changes nothing.
    """

    device_id: UUID
    display_name: str = Field(min_length=1, max_length=MAX_DISPLAY_NAME_LENGTH)
    runs: list[LeaderboardRunSubmission] = Field(max_length=MAX_RUNS_PER_SUBMISSION)

    @field_validator("display_name")
    @classmethod
    def _no_blank_after_trim(cls, name: str) -> str:
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("display_name cannot be blank")
        return trimmed


class SubmitLeaderboardResponse(BaseModel):
    """Acks a sync.

    `accepted_runs` counts rows actually inserted, not the length of the
    request — a resubmission of already-stored runs is accepted but
    changes nothing, so a caller checking "did this do anything" can look
    here rather than assuming success means novelty.

    `device_hash` is returned so the frontend can recognise its own row
    in a fetched leaderboard without ever holding a second implementation
    of the hash function — see LeaderboardEntry below for why the raw
    device id is never returned from anywhere.
    """

    accepted_runs: int
    total_score: int
    device_hash: str


class LeaderboardEntry(BaseModel):
    """One row on the board — a device's cumulative score, never a run.

    Deliberately has no device_id field. ADR 021: the raw id is a bearer
    credential in practice, so returning it here — even to identify rows,
    even truncated — would publish it to every viewer of the board.
    `device_hash` is a one-way derivation computed server-side
    (leaderboard_service.py), safe to expose because it cannot be used to
    submit as that device.
    """

    device_hash: str
    display_name: str
    total_score: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
