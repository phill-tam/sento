from enum import Enum


class ContentStatus(str, Enum):
    """Curation state for CMS-authored content rows (Kanji, Vocab, Grammar).

    Shared across KanjiEntry, VocabEntry, and GrammarEntry so the three
    models stay in sync rather than each defining its own copy.
    """

    DRAFT = "draft"
    SUGGESTED = "suggested"
    APPROVED = "approved"


class ContentSource(str, Enum):
    """How a content row entered the system — human upload vs LLM suggestion."""

    MANUAL = "manual"
    LLM_SUGGESTED = "llm_suggested"