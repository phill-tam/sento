from pydantic import BaseModel

from app.models.content_status import ContentStatus


class ContentStatusUpdate(BaseModel):
    """Request body for PATCH .../{id}/status — the only field an
    approval action changes."""

    status: ContentStatus