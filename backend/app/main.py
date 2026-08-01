from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402

from app.api.v1.router import router as v1_router  # noqa: E402
from app.middleware.cors import add_cors_middleware  # noqa: E402

app = FastAPI(title="Sento API", version="0.1.0")

add_cors_middleware(app)
app.include_router(v1_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}