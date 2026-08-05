from fastapi import APIRouter

from app.config.feature_flags import flags

router = APIRouter(prefix="/api/v1")

if flags.content_management:
    from app.routes import grammar, kanji, vocab

    router.include_router(kanji.router)
    router.include_router(vocab.router)
    router.include_router(grammar.router)

if flags.sentence_generator:
    from app.routes import sentence_folders, sentences

    router.include_router(sentence_folders.router)
    router.include_router(sentences.router)