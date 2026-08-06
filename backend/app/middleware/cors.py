from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://sentou.vercel.app",
]


def add_cors_middleware(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=r"https://(localhost:5173|sento-xi(-.*)?\.vercel\.app)",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )