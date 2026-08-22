from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI

from app.api.v1.router import router as v1_router
from app.middleware.cors import add_cors_middleware
from app.middleware.errors import add_error_handling_middleware

app = FastAPI(title="Sento API", version="0.1.0")

# Order is load-bearing and reads backwards: Starlette's add_middleware
# inserts at the front, so the LAST one added is the outermost. CORS goes
# second precisely so it wraps the error handler and can decorate the 500
# that one produces. See middleware/errors.py — swapping these two lines
# silently restores the bug they exist to fix.
add_error_handling_middleware(app)
add_cors_middleware(app)
app.include_router(v1_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}