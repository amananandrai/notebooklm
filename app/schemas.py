"""Request/response models."""
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.generators import TOOLS


class ProjectSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    color: str
    color2: str
    icon: str
    sourceIds: List[str] = []
    createdAt: str
    updatedAt: str


class DocumentSchema(BaseModel):
    id: str
    projectId: str
    title: str = "Untitled Document"
    pages: int = 1
    words: int = 0
    rawText: str = ""
    uploadedAt: Optional[str] = None
    createdAt: Optional[str] = None


class ArtifactSchema(BaseModel):
    """Client-saved artifacts (chat history). Generated artifacts are saved by the server."""
    projectId: str
    docId: str
    featureType: str
    data: Any
    key: Optional[str] = None  # legacy; derived from the ids when omitted


class NoteSchema(BaseModel):
    id: str
    projectId: str
    docId: Optional[str] = None
    title: str
    content: str
    tags: List[str] = []
    createdAt: str
    updatedAt: str


class GenerateRequest(BaseModel):
    projectId: str
    docId: Optional[str] = None  # not used by project-level tools (synthesis)
    tool: str = Field(..., description="One of: " + ", ".join(TOOLS))
    options: dict = {}
    force: bool = False  # bypass the cache (Regenerate)


class ChatRequest(BaseModel):
    projectId: str
    docId: str
    question: str = Field(..., min_length=1, max_length=4000)
    history: List[dict] = []


class TTSRequest(BaseModel):
    turns: List[dict]
