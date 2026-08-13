import json

from app.schemas.sentence_generate import GeneratedSentenceCandidate

# Only what this module actually uses. The previous commit re-exported the
# whole provider layer so the move would not touch routes/sentences.py;
# that route now imports from app.services.ai_provider directly, so the
# passthrough is gone rather than left behind as a second name for the
# same thing.
from app.services.ai_provider import AiProviderFailedError, get_provider


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
        raise AiProviderFailedError(f"provider returned unparseable output: {exc}") from exc

    try:
        candidates = [GeneratedSentenceCandidate(**item) for item in parsed]
    except (TypeError, ValueError) as exc:
        raise AiProviderFailedError(f"provider response missing expected fields: {exc}") from exc

    return candidates[:expected_count]


def generate_sentences(
    source_items: list[str],
    count: int,
    nuance: str | None,
) -> list[GeneratedSentenceCandidate]:
    """Entry point called by the generate route (Step 5).

    Takes resolved content snippets, not SourceItemRef objects — the route
    resolves them first (the annotation here previously said otherwise and
    was simply wrong; nothing behaved differently).

    Lets AiProviderRateLimitExceeded and AiProviderFailedError
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