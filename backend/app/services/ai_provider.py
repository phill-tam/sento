"""The AI provider layer, shared by every feature that needs a completion.

Extracted from sentence_generation_service.py, which was its only caller
until epic 012's answer grading arrived. Nothing here knows what a
sentence is: a provider takes a prompt, returns raw text, and translates
its own SDK's failures into the two exception types below. Prompt
construction and response parsing belong to the feature doing the asking.

get_provider() is the ONLY place in this codebase that branches on
settings.environment. Keeping it that way is the point of this module —
a second feature reaching for a second switch is exactly the drift it
prevents.
"""

from typing import Protocol

import anthropic
from google import genai
from google.genai import errors as genai_errors

from app.config.settings import settings


class SentenceGenerationRateLimitExceeded(Exception):
    """Raised when the underlying AI provider reports a rate/usage-limit
    error. Caught in the route layer (Step 5) to return the API's own
    distinct SentenceGenerationError response, not a generic 500."""


class SentenceGenerationFailedError(Exception):
    """Raised for any other provider-side failure — malformed response,
    network error, unparseable output. Not a rate limit."""


class SentenceProvider(Protocol):
    """Common interface both AI providers implement, so the orchestration
    function below never branches on provider identity itself.

    Deliberately narrow: prompt in, raw text out. A provider owns its SDK
    call and the mapping from that SDK's errors onto this module's two
    exception types, and nothing else. Prompt construction and response
    parsing belong to the *feature* asking for the completion, not to the
    provider — a second caller wanting a different response shape (epic
    012's answer grading) cannot reuse a method that returns
    GeneratedSentenceCandidate.

    max_tokens is a parameter rather than a constant because the two
    callers genuinely differ: three sentences fit comfortably in 1024,
    six graded verdicts with per-word notes do not.
    """

    def complete(self, *, prompt: str, max_tokens: int = 1024) -> str: ...


class GeminiSentenceProvider:
    """Dev-environment provider."""

    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.gemini_api_key)

    def complete(self, *, prompt: str, max_tokens: int = 1024) -> str:
        # max_tokens is accepted for protocol conformance and not sent:
        # this SDK takes it as max_output_tokens inside a generation config
        # rather than a top-level argument, and adding one here would be an
        # untested behaviour change riding along with a refactor. Gemini's
        # own default ceiling is well above what either caller needs.
        try:
            response = self._client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
            )
            text = response.text
        except genai_errors.ClientError as exc:
            if exc.code == 429:
                raise SentenceGenerationRateLimitExceeded(str(exc)) from exc
            raise SentenceGenerationFailedError(str(exc)) from exc
        except genai_errors.APIError as exc:
            # covers ServerError (5xx) and any other APIError subtype
            raise SentenceGenerationFailedError(str(exc)) from exc
        except ValueError as exc:
            # .text raises ValueError when there's no text part
            # (blocked prompt, safety filtering, empty candidates)
            raise SentenceGenerationFailedError(f"provider returned no text: {exc}") from exc

        return text


class ClaudeSentenceProvider:
    """Prod-environment provider."""

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def complete(self, *, prompt: str, max_tokens: int = 1024) -> str:
        try:
            response = self._client.messages.create(
                model=settings.anthropic_model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError as exc:
            raise SentenceGenerationRateLimitExceeded(str(exc)) from exc
        except anthropic.APIError as exc:
            raise SentenceGenerationFailedError(str(exc)) from exc

        return "".join(block.text for block in response.content if block.type == "text")


def get_provider() -> SentenceProvider:
    """Environment-based switch — the only place that reads
    settings.environment for this feature, per the epic's requirement
    that swapping providers never touches the route or schema layer."""
    if settings.environment == "production":
        return ClaudeSentenceProvider()
    return GeminiSentenceProvider()
