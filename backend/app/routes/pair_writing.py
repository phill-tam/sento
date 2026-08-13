from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.pair_writing import (
    GradePairAnswersRequest,
    GradePairAnswersResponse,
)
from app.schemas.sentence_generate import SentenceGenerationError
from app.services.ai_provider import AiProviderFailedError, AiProviderRateLimitExceeded
from app.services.answer_grading_service import ResolvedPairAnswer, grade_pair_answers
from app.services.content_resolver import resolve_source_items

# Mounted unconditionally, like /sentences/generate and unlike the admin
# routers: this is a read-shaped study action, not a content write. It
# does spend provider quota per call with no authentication in front of
# it, which is the same knowingly-accepted gap as ADR 012 — see #126,
# where the per-call bounds (six answers, 300 characters each) and the
# learner-facing warning are the mitigations.
router = APIRouter(prefix="/pair-writing", tags=["pair-writing"])


@router.post("/grade", response_model=GradePairAnswersResponse)
def grade_pair_answers_endpoint(
    payload: GradePairAnswersRequest,
    db: Annotated[Session, Depends(get_db)],
) -> GradePairAnswersResponse:
    """Grades a whole run in one provider call.

    Refs are resolved to real Japanese here, before the service is called,
    exactly as the generation route does — and for the same reason: a
    model cannot judge a word it was handed as a UUID.
    """
    resolved = [
        ResolvedPairAnswer(
            pair_id=answer.pair_id,
            words=answer.words,
            word_snippets=resolve_source_items(db, answer.words),
            answer=answer.answer,
        )
        for answer in payload.answers
    ]

    try:
        verdicts = grade_pair_answers(resolved)
    except AiProviderRateLimitExceeded as exc:
        # Same body shape the generation route returns, because api.js
        # detects a rate limit by `detail.error === "rate_limit_exceeded"`
        # and turns it into RateLimitError. Reusing the shape is what lets
        # the frontend show its dedicated notice with no client change.
        raise HTTPException(
            status_code=429,
            detail=SentenceGenerationError(detail=str(exc)).model_dump(),
        ) from exc
    except AiProviderFailedError as exc:
        raise HTTPException(status_code=502, detail=f"answer grading failed: {exc}") from exc

    return GradePairAnswersResponse(verdicts=verdicts)
