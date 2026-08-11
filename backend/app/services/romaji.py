"""Kana -> romaji transliteration.

Shared by the seed script and the CSV upload row parsers, so an entry's
romaji is produced the same way whether it was authored here or uploaded
later. Deliberately has no SQLAlchemy or FastAPI imports — it is a pure
string function and is tested as one.

**Kana-faithful, not macron Hepburn.** おう becomes ``ou``, not ``ō``.
This is not a style preference — it is the only rule that is mechanically
correct. Distinguishing 王 (``ō``, a long vowel) from 追う (``ou``, a verb
ending) requires knowing which morpheme boundary sits between the お and
the う, which no character-level pass can recover. Macron output would
silently mis-romanize every う-verb in the vocab line (思う as ``omō``
rather than ``omou``). Kana-faithful output is also what a learner types
into the search box, which is the other reason it wins here.

Non-kana input (kanji, Latin placeholders, punctuation) is passed through
unchanged rather than dropped, so structural text like ``Xは Yです`` and
okurigana notation like ``まな(ぶ)`` keep their shape. Callers that need to
know whether anything was left untransliterated should use
:func:`contains_kanji` rather than inspecting the output.
"""

import re

# Digraphs first — these must be matched before their single-kana prefixes,
# which is why lookup walks longest-first rather than character by character.
_DIGRAPHS = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "ぢゃ": "ja", "ぢゅ": "ju", "ぢょ": "jo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    # Katakana-only combinations used in loanwords (フォ in フォーク etc.)
    "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe", "ふぉ": "fo",
    "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo",
    "てぃ": "ti", "でぃ": "di", "とぅ": "tu", "どぅ": "du",
    "しぇ": "she", "ちぇ": "che", "じぇ": "je",
    "うぃ": "wi", "うぇ": "we", "うぉ": "wo",
}

_MONOGRAPHS = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n",
    "ゔ": "vu",
    # Bare small kana, reached only when they don't form a digraph above.
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
    "ゃ": "ya", "ゅ": "yu", "ょ": "yo", "ゎ": "wa",
}

_SOKUON = "っ"
_CHOONPU = "ー"
_KATAKANA_START = 0x30A1
_KATAKANA_END = 0x30F6
_KANA_GAP = 0x60  # katakana codepoint - hiragana codepoint

_KANJI_RE = re.compile(r"[一-鿿㐀-䶿]")
_VOWELS = "aiueo"

# Whole-string fixed expressions where a kana plays a grammatical role
# instead of its literal syllable value, so the mechanical algorithm below
# gets it wrong even though the input is plain kana with no kanji at all.
# Checked as an exact match on the full input before that algorithm runs —
# narrow on purpose, so it only firms up known exceptions rather than
# guessing at word boundaries anywhere else in the string.
_FIXED_EXPRESSIONS = {
    "こんにちは": "konnichiwa",  # topic-particle は, not the syllable "ha"
    "こんばんは": "konbanwa",  # same
}


def _to_hiragana(text: str) -> str:
    """Folds katakana onto hiragana so one table serves both.

    Kanji onyomi are stored in katakana (``イチ``) and kunyomi in hiragana
    (``ひと``); both need the same output, so normalizing up front is
    cheaper than maintaining a second table.
    """
    return "".join(
        chr(ord(ch) - _KANA_GAP) if _KATAKANA_START <= ord(ch) <= _KATAKANA_END else ch
        for ch in text
    )


def contains_kanji(text: str) -> bool:
    """True if `text` holds any CJK ideograph.

    Used by callers that need to fail loudly rather than emit half-
    transliterated output — the seed generator uses it to refuse to guess
    at grammar patterns like ``~の上/下/中`` instead of silently passing
    the kanji through.
    """
    return bool(_KANJI_RE.search(text))


def to_romaji(text: str | None) -> str | None:
    """Transliterates every kana run in `text`, leaving everything else as-is.

    Returns None for None input so callers can map over nullable columns
    without a guard at each site. Empty/whitespace-only input returns the
    input unchanged rather than an empty string, keeping the round trip
    honest for CSV cells that were blank to begin with.
    """
    if text is None:
        return None
    if text in _FIXED_EXPRESSIONS:
        return _FIXED_EXPRESSIONS[text]

    src = _to_hiragana(text)
    out: list[str] = []
    i = 0
    pending_sokuon = False

    while i < len(src):
        two = src[i : i + 2]
        one = src[i]

        if one == _SOKUON:
            pending_sokuon = True
            i += 1
            continue

        if one == _CHOONPU:
            # Long-vowel mark: repeat whatever vowel we last emitted. If the
            # previous output wasn't a vowel (start of string, punctuation),
            # there is nothing to lengthen, so drop it rather than emit a
            # stray hyphen into a searchable field.
            if out and out[-1] and out[-1][-1] in _VOWELS:
                out.append(out[-1][-1])
            i += 1
            continue

        syllable = _DIGRAPHS.get(two)
        if syllable is not None:
            i += 2
        else:
            syllable = _MONOGRAPHS.get(one)
            if syllable is None:
                # Non-kana: kanji, Latin, punctuation, whitespace. A pending
                # sokuon before non-kana has nothing to double, so it is
                # dropped here rather than carried across the boundary.
                out.append(one)
                pending_sokuon = False
                i += 1
                continue
            i += 1

        if pending_sokuon:
            # っ doubles the following consonant; before `ch` Hepburn writes
            # `tch` (まっちゃ -> matcha), not `cch`.
            first = "t" if syllable.startswith("ch") else syllable[0]
            out.append(first)
            pending_sokuon = False

        # ん needs an apostrophe before a vowel or y, or the boundary is lost:
        # しんよう would otherwise read as shi-nyo-u rather than shin-you.
        if out and out[-1] == "n" and (syllable[0] in _VOWELS or syllable[0] == "y"):
            out.append("'")

        out.append(syllable)

    return "".join(out)
