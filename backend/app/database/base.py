from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# Imported here (not used directly) so Alembic's autogenerate can discover
# them via Base.metadata.
from app.models.kanji_entry import KanjiEntry  # noqa: E402, F401
from app.models.vocab_entry import VocabEntry  # noqa: E402, F401
from app.models.grammar_entry import GrammarEntry  # noqa: E402, F401