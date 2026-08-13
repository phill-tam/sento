from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.sentence_entry import SourceItemRef

# C(4,2). The learner picks 2-4 items and every unordered pair becomes one
# task, so a full run is six answers and one grading call. Enforced here so
# a client cannot turn one request into an arbitrarily large provider bill
# against an endpoint with no authentication in front of it.
MAX_ANSWERS_PER_RUN = 6

# One sentence. Also bounds the prompt: six answers at this ceiling is the
# largest input the grader can be handed.
MAX_ANSWER_LENGTH = 300

# Word pairs are built from single words carrying one sense. A grammar
# pattern is a phrase with a structural meaning and a saved sentence is
# already a sentence — neither has a sense to use or misuse, so neither is
# a valid pair word. Rejected here rather than silently graded, even though
# content_resolver would resolve a grammar ref perfectly well.
PAIR_ELIGIBLE_LINES = frozenset({"kanji", "vocab"})


class PairAnswerSubmission(BaseModel):
    """One pair, and what the learner wrote for it."""

    pair_id: str = Field(min_length=1, max_length=200)
    words: list[SourceItemRef] = Field(min_length=2, max_length=2)
    answer: str = Field(min_length=1, max_length=MAX_ANSWER_LENGTH)

    @field_validator("words")
    @classmethod
    def _only_pair_eligible_lines(cls, words: list[SourceItemRef]) -> list[SourceItemRef]:
        bad = sorted({w.line_id for w in words if w.line_id not in PAIR_ELIGIBLE_LINES})
        if bad:
            raise ValueError(
                f"word pairs accept {sorted(PAIR_ELIGIBLE_LINES)} only, got: {bad}"
            )
        return words


class GradePairAnswersRequest(BaseModel):
    """Request body for POST .../pair-writing/grade.

    A list rather than a single answer, deliberately: the client submits a
    whole run in one call, so grading costs one provider request whether
    the run is one pair or six. The shape also leaves per-answer instant
    grading available later as a pure client change — it would simply send
    lists of length one.
    """

    answers: list[PairAnswerSubmission] = Field(min_length=1, max_length=MAX_ANSWERS_PER_RUN)


class WordVerdict(BaseModel):
    """Per-word detail behind a pair's verdict — which word let it down."""

    line_id: str
    item_id: UUID
    used: bool
    sense_ok: bool


class PairAnswerVerdict(BaseModel):
    """The graded result for one pair.

    `ungradeable` is a third outcome rather than a flavour of `incorrect`:
    a blank, off-task or nonsense answer is a different event from a wrong
    one, and a pair the provider failed to return at all is a third. The
    scoring keeps them out of the denominator; the client presents them as
    "couldn't check this one".
    """

    pair_id: str
    verdict: Literal["correct", "incorrect", "ungradeable"]
    words: list[WordVerdict] = []
    feedback: str
    suggestion: str | None = None


class GradePairAnswersResponse(BaseModel):
    verdicts: list[PairAnswerVerdict]
