from fastapi import APIRouter

from app.config.settings import settings
from app.routes import (
    grammar,
    kanji,
    leaderboard,
    pair_writing,
    sentence_folders,
    sentences,
    vocab,
)

router = APIRouter(prefix="/api/v1")

# Every feature is unconditionally mounted — the per-epic feature flags
# that used to gate these were removed once all epics shipped (ADR 012).
router.include_router(kanji.router)
router.include_router(vocab.router)
router.include_router(grammar.router)
router.include_router(sentences.router)
router.include_router(pair_writing.router)

# Also unconditional, but for a different reason than the five above —
# see leaderboard.py's own comment. Those five are unauthenticated
# because auth doesn't exist yet; this one is unauthenticated because
# public reachability is the feature (epic 015, ADR 021).
router.include_router(leaderboard.router)

# Both remaining gates are access control rather than epic gating: these
# endpoints have no authentication in front of them, so keeping them out
# of the schema is the only thing preventing anonymous use. Off by
# default; enable either one only where you are the sole reachable caller
# (ADR 011, ADR 012).

# Content writes — CSV upload, status changes.
if settings.admin_writes_enabled:
    router.include_router(kanji.admin_router)
    router.include_router(vocab.admin_router)
    router.include_router(grammar.admin_router)

# Sentence and folder persistence. Saved sentences live in the user's
# browser as of epic 013, so nothing calls these; mounted, they are an
# unattributed shared pile any visitor can write into. Note that
# sentences.router above is still mounted unconditionally — that is
# generation, which has no persistence and which the app needs.
if settings.sentence_persistence_enabled:
    router.include_router(sentences.persistence_router)
    router.include_router(sentence_folders.persistence_router)
