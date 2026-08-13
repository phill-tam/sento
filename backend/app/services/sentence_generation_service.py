import json
from typing import Protocol

import anthropic
from google import genai
from google.genai import errors as genai_errors

from app.config.settings import settings
from app.schemas.sentence_generate import GeneratedSentenceCandidate


class SentenceGenerationRateLimitExceeded(Exception):
    """Raised when the underlying AI provider reports a rate/usage-limit
    error. Caught in the route layer (Step 5) to return the API's own
    distinct SentenceGenerationError response, not a generic 500."""


class SentenceGenerationFailedError(Exception):
    """Raised for any other provider-side failure — malformed response,
    network error, unparseable output. Not a rate limit."""


def _build_prompt(source_items: list[str], count: int, nuance: str | None) -> str:
    """Builds the generation prompt.

    `source_items` are already-resolved content snippets like
    "猫 (cat)" — the route layer turns line_id/item_id pairs into these
    via _resolve_source_items, so the prompt always carries real Japanese
    text rather than opaque IDs the model can't use.

    The reading and romaji formats are pinned explicitly. Left unstated,
    providers vary between kana and kanji-with-furigana for `reading`, and
    between macron and kana-faithful romaji — and romaji that disagrees
    with `services/romaji.to_romaji` would put "tōkyō" on a sentence card
    next to "toukyou" on a vocab card in the same app (ADR 015).
    """
    nuance_line = f"Nuance/topic to aim for: {nuance}\n" if nuance else ""
    return (
        f"Generate {count} natural N5-level Japanese practice sentences "
        f"using the following source items:\n{source_items}\n"
        f"{nuance_line}"
        "Respond ONLY with a JSON array of objects, each shaped exactly as "
        '{"jp_text": "...", "reading": "...", "romaji": "...", "meaning_en": "..."}.\n'
        "- reading: the full sentence in hiragana/katakana only, no kanji.\n"
        "- romaji: Hepburn, lowercase, with spaces between words.\n"
        "  Transliterate the kana literally rather than marking long "
        'vowels: write "ou" and "uu", never "ō" or "ū".\n'
        '  Romanise particles by how they are pronounced: は as "wa", '
        'へ as "e", を as "o".\n'
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


def generate_sentences(
    source_items: list[str],
    count: int,
    nuance: str | None,
) -> list[GeneratedSentenceCandidate]:
    """Entry point called by the generate route (Step 5).

    Takes resolved content snippets, not SourceItemRef objects — the route
    resolves them first (the annotation here previously said otherwise and
    was simply wrong; nothing behaved differently).

    Lets SentenceGenerationRateLimitExceeded and SentenceGenerationFailedError
    propagate uncaught — the route layer maps each to its own HTTP response,
    per this codebase's "404/409/501 handled at the service layer" standard
    extended here to 429/502 for this feature's two failure modes.

    Owns the parse now that the provider only returns text. This is the
    same three steps in the same order as before — build, call, parse —
    with the last one on this side of the boundary.
    """
    provider = get_provider()
    prompt = _build_prompt(source_items, count, nuance)
    raw_text = provider.complete(prompt=prompt)
    return _parse_candidates(raw_text, expected_count=count)