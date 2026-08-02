"""Central model registry.

Import this package (not individual model modules, and not via
database/base.py) to guarantee every model is registered on
Base.metadata — needed by Alembic's autogenerate. This package has no
dependency back on database/base.py, which is what avoids the circular
import that direct imports from base.py caused.
"""

from app.models.content_status import ContentSource, ContentStatus
from app.models.grammar_entry import GrammarEntry
from app.models.kanji_entry import KanjiEntry
from app.models.vocab_entry import VocabEntry

__all__ = [
    "ContentSource",
    "ContentStatus",
    "GrammarEntry",
    "KanjiEntry",
    "VocabEntry",
]