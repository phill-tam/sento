from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SentenceFolderCreate(BaseModel):
    """Request body for POST .../sentence-folders."""

    name: str


class SentenceFolderRename(BaseModel):
    """Request body for PATCH .../sentence-folders/{id} — the only field
    a rename action changes."""

    name: str


class SentenceFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime