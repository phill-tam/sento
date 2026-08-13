"""Request-shape guards for the grading endpoint.

These are not incidental validation. The endpoint spends provider quota
with no authentication in front of it (the ADR 012 gap), so the bounds on
a single request are the only thing standing between one call and an
arbitrarily large one.
"""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.pair_writing import (
    MAX_ANSWER_LENGTH,
    MAX_ANSWERS_PER_RUN,
    GradePairAnswersRequest,
)

KANJI = {"line_id": "kanji", "item_id": str(uuid4())}
VOCAB = {"line_id": "vocab", "item_id": str(uuid4())}


def answer(**overrides) -> dict:
    return {"pair_id": "p1", "words": [KANJI, VOCAB], "answer": "A sentence.", **overrides}


def build(*answers: dict) -> GradePairAnswersRequest:
    return GradePairAnswersRequest(answers=list(answers))


class TestRunSize:
    def test_accepts_a_full_run(self):
        # C(4,2) = 6, the largest run the 4-item cap can produce.
        assert MAX_ANSWERS_PER_RUN == 6
        assert len(build(*[answer(pair_id=f"p{i}") for i in range(6)]).answers) == 6

    def test_rejects_more_than_a_full_run(self):
        with pytest.raises(ValidationError):
            build(*[answer(pair_id=f"p{i}") for i in range(7)])

    def test_rejects_an_empty_run(self):
        with pytest.raises(ValidationError):
            build()


class TestAnswerText:
    def test_rejects_a_blank_answer(self):
        # Blank answers are skipped client-side and never sent; a blank
        # arriving here is a client bug, not something to spend a call on.
        with pytest.raises(ValidationError):
            build(answer(answer=""))

    def test_accepts_the_longest_permitted_answer(self):
        assert MAX_ANSWER_LENGTH == 300
        build(answer(answer="x" * 300))

    def test_rejects_an_over_long_answer(self):
        with pytest.raises(ValidationError):
            build(answer(answer="x" * 301))


class TestPairWords:
    def test_requires_exactly_two_words(self):
        with pytest.raises(ValidationError):
            build(answer(words=[KANJI]))
        with pytest.raises(ValidationError):
            build(answer(words=[KANJI, VOCAB, KANJI]))

    def test_accepts_a_mixed_kanji_and_vocab_pair(self):
        # Mixing lines within one run is the point — nothing about the
        # exercise cares which table a word came from once it has a gloss.
        assert len(build(answer(words=[KANJI, VOCAB])).answers[0].words) == 2

    @pytest.mark.parametrize("line_id", ["grammar", "sentence"])
    def test_rejects_lines_with_no_single_sense(self, line_id):
        """content_resolver would resolve a grammar ref perfectly well,
        which is exactly why this refusal has to be explicit: a pattern is
        a phrase with a structural meaning, not a word with a sense to
        use or misuse."""
        with pytest.raises(ValidationError, match="word pairs accept"):
            build(answer(words=[{"line_id": line_id, "item_id": str(uuid4())}, VOCAB]))
