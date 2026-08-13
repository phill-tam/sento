from fastapi import APIRouter

from app.config.settings import settings
from app.routes import grammar, kanji, pair_writing, sentence_folders, sentences, vocab

router = APIRouter(prefix="/api/v1")

# Every feature is unconditionally mounted — the per-epic feature flags
# that used to gate these were removed once all epics shipped (ADR 012).
router.include_router(kanji.router)
router.include_router(vocab.router)
router.include_router(grammar.router)
router.include_router(sentences.router)
router.include_router(sentence_folders.router)
router.include_router(pair_writing.router)

# The one remaining gate, and it is access control rather than epic
# gating: content writes (CSV upload, status changes) have no
# authentication in front of them, so keeping them out of the schema is
# the only thing preventing anonymous edits. Off by default; enable it
# only where you are the sole reachable caller (ADR 011, ADR 012).
if settings.admin_writes_enabled:
    router.include_router(kanji.admin_router)
    router.include_router(vocab.admin_router)
    router.include_router(grammar.admin_router)
