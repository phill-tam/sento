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
    function below never branches on provider identity itself."""

    def generate(self, *, prompt: str, count: int) -> list[GeneratedSentenceCandidate]: ...


class GeminiSentenceProvider:
    """Dev-environment provider."""

    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.gemini_api_key)

    def generate(self, *, prompt: str, count: int) -> list[GeneratedSentenceCandidate]:
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

        return _parse_candidates(text, expected_count=count)


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
    """
    provider = get_provider()
    prompt = _build_prompt(source_items, count, nuance)
    return provider.generate(prompt=prompt, count=count)