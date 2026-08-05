from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.sentence_entry import GeneratedSentence
from app.models.sentence_folder import SentenceFolder
from app.schemas.sentence_folder import (
    SentenceFolderCreate,
    SentenceFolderRead,
    SentenceFolderRename,
)

router = APIRouter(prefix="/sentence-folders", tags=["sentence-folders"])


@router.get("", response_model=list[SentenceFolderRead])
def get_sentence_folders(db: Annotated[Session, Depends(get_db)]) -> list[SentenceFolder]:
    return list(db.scalars(select(SentenceFolder)))


@router.post("", response_model=SentenceFolderRead)
def create_sentence_folder(
    payload: SentenceFolderCreate,
    db: Annotated[Session, Depends(get_db)],
) -> SentenceFolder:
    folder = SentenceFolder(name=payload.name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=SentenceFolderRead)
def rename_sentence_folder(
    folder_id: UUID,
    payload: SentenceFolderRename,
    db: Annotated[Session, Depends(get_db)],
) -> SentenceFolder:
    folder = db.get(SentenceFolder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="sentence folder not found")
    folder.name = payload.name
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_sentence_folder(
    folder_id: UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Hard-blocked (409) while the folder still contains sentences —
    no override, per the epic's two-gate deletion design. The frontend's
    ConfirmDialog step happens before this call is ever made, but the
    precondition is enforced here regardless of what the frontend does.
    """
    folder = db.get(SentenceFolder, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="sentence folder not found")

    has_sentences = db.scalar(
        select(GeneratedSentence.id).where(GeneratedSentence.folder_id == folder_id).limit(1)
    )
    if has_sentences is not None:
        raise HTTPException(status_code=409, detail="folder is not empty")

    db.delete(folder)
    db.commit()