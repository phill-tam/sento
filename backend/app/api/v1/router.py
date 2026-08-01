from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

# Route modules attach here once the feature branch adds them, e.g.:
# from app.routes import items
# router.include_router(items.router)