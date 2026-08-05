import json
from typing import Protocol

import anthropic
import google.generativeai as genai

from app.config.settings import settings
from app.schemas.sentence_generate import GeneratedSentenceCandidate, SourceItemRef


class SentenceGenerationRateLimitExceeded(Exception):
    """Raised when the underlying AI provider reports a rate/usage-limit
    error. Caught in the route layer (Step 5) to return the API's own
    distinct SentenceGenerationError response, not a generic 500."""


class SentenceGenerationFailedError(Exception):
    """Raised for any other provider-side failure — malformed response,
    network error, unparseable output. Not a rate limit."""


def _build_prompt(source_item_refs: list[SourceItemRef], count: int, nuance: str | None) -> str:
    """Builds the generation prompt. source_item_refs are passed as raw
    line_id/item_id pairs — the caller (route layer) is responsible for
    resolving them to actual kanji/vocab/grammar content before this
    function is called, so the prompt always carries real Japanese text,
    not opaque IDs the model can't use."""
    nuance_line = f"Nuance/topic to aim for: {nuance}\n" if nuance else ""
    return (
        f"Generate {count} natural N5-level Japanese practice sentences "
        f"using the following source items:\n{source_item_refs}\n"
        f"{nuance_line}"
        'Respond ONLY with a JSON array of objects, each shaped exactly as '
        '{"jp_text": "...", "reading": "...", "meaning_en": "..."}. '
        "No markdown fences, no preamble, no explanation."
    )


def _parse_candidates(raw_text: str, *, expected_count: int) -> list[GeneratedSentenceCandidate]:
    """Parses the provider's JSON response into typed candidates.

    Providers occasionally wrap JSON in markdown fences despite
    instructions not to — stripped defensively before parsing.
    """
    cleaned = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise SentenceGenerationFailedError(f"provider returned unparseable output: {exc}") from exc

    try:
        candidates = [GeneratedSentenceCandidate(**item) for item in parsed]
    except (TypeError, ValueError) as exc:
        raise SentenceGenerationFailedError(f"provider response missing expected fields: {exc}") from exc

    return candidates[:expected_count]


class SentenceProvider(Protocol):
    """Common interface both AI providers implement, so the orchestration
    function below never branches on provider identity itself."""

    def generate(self, *, prompt: str, count: int) -> list[GeneratedSentenceCandidate]: ...


class GeminiSentenceProvider:
    """Dev-environment provider."""

    def __init__(self) -> None:
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(settings.gemini_model)

    def generate(self, *, prompt: str, count: int) -> list[GeneratedSentenceCandidate]:
        try:
            response = self._model.generate_content(prompt)
        except genai.types.generation_types.StopCandidateException as exc:
            raise SentenceGenerationFailedError(str(exc)) from exc
        except Exception as exc:
            if "ResourceExhausted" in type(exc).__name__ or "429" in str(exc):
                raise SentenceGenerationRateLimitExceeded(str(exc)) from exc
            raise SentenceGenerationFailedError(str(exc)) from exc

        return _parse_candidates(response.text, expected_count=count)


class ClaudeSentenceProvider:
    """Prod-environment provider."""

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def generate(self, *, prompt: str, count: int) -> list[GeneratedSentenceCandidate]:
        try:
            response = self._client.messages.create(
                model=settings.anthropic_model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError as exc:
            raise SentenceGenerationRateLimitExceeded(str(exc)) from exc
        except anthropic.APIError as exc:
            raise SentenceGenerationFailedError(str(exc)) from exc

        text = "".join(block.text for block in response.content if block.type == "text")
        return _parse_candidates(text, expected_count=count)


def get_provider() -> SentenceProvider:
    """Environment-based switch — the only place that reads
    settings.environment for this feature, per the epic's requirement
    that swapping providers never touches the route or schema layer."""
    if settings.environment == "production":
        return ClaudeSentenceProvider()
    return GeminiSentenceProvider()


def generate_sentences(
    source_item_refs: list[SourceItemRef],
    count: int,
    nuance: str | None,
) -> list[GeneratedSentenceCandidate]:
    """Entry point called by the generate route (Step 5).

    Lets SentenceGenerationRateLimitExceeded and SentenceGenerationFailedError
    propagate uncaught — the route layer maps each to its own HTTP response,
    per this codebase's "404/409/501 handled at the service layer" standard
    extended here to 429/502 for this feature's two failure modes.
    """
    provider = get_provider()
    prompt = _build_prompt(source_item_refs, count, nuance)
    return provider.generate(prompt=prompt, count=count)