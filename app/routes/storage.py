"""Projects, documents, artifacts and notes (MongoDB, scoped by owner)."""
from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db
from app.schemas import ArtifactSchema, DocumentSchema, NoteSchema, ProjectSchema
from app.security import current_owner, scope, stamp, utcnow
from app.settings import settings

router = APIRouter(prefix="/api")

PROJECT_LEVEL = "__project__"  # docId used for artifacts that span the whole project
HIDDEN = {"_id": 0, "ownerId": 0}


def artifact_key(project_id: str, doc_id: str, tool: str) -> str:
    return f"{project_id}_{doc_id}_{tool}"


async def save_artifact_doc(db, owner, project_id: str, doc_id: str, tool: str, data, **meta) -> None:
    key = artifact_key(project_id, doc_id, tool)
    doc = {"key": key, "projectId": project_id, "docId": doc_id, "featureType": tool,
           "data": data, "updatedAt": utcnow().isoformat(), **meta}
    await db["artifacts"].update_one(scope(owner, {"key": key}), {"$set": stamp(owner, doc)}, upsert=True)


# ── Projects ──
@router.get("/projects")
async def list_projects(owner=Depends(current_owner)):
    db = await get_db()
    cursor = db["projects"].find(scope(owner, {}), HIDDEN).sort("updatedAt", -1)
    return await cursor.to_list(length=500)


@router.get("/projects/{project_id}")
async def get_project(project_id: str, owner=Depends(current_owner)):
    db = await get_db()
    project = await db["projects"].find_one(scope(owner, {"id": project_id}), HIDDEN)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects")
async def save_project(project: ProjectSchema, owner=Depends(current_owner)):
    db = await get_db()
    await db["projects"].update_one(scope(owner, {"id": project.id}), {"$set": stamp(owner, project.model_dump())}, upsert=True)
    return {"status": "success"}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, owner=Depends(current_owner)):
    db = await get_db()
    await db["projects"].delete_one(scope(owner, {"id": project_id}))
    for collection in ("documents", "artifacts", "notes"):
        await db[collection].delete_many(scope(owner, {"projectId": project_id}))
    return {"status": "success"}


# ── Documents ──
@router.post("/documents")
async def save_document(doc: DocumentSchema, owner=Depends(current_owner)):
    db = await get_db()
    if len(doc.rawText) > settings.max_document_chars:
        raise HTTPException(status_code=413, detail=f"Document text exceeds {settings.max_document_chars:,} characters.")
    await db["documents"].update_one(scope(owner, {"id": doc.id}), {"$set": stamp(owner, doc.model_dump())}, upsert=True)
    await db["projects"].update_one(
        scope(owner, {"id": doc.projectId}),
        {"$addToSet": {"sourceIds": doc.id}, "$set": {"updatedAt": utcnow().isoformat()}},
    )
    return {"status": "success"}


@router.get("/projects/{project_id}/documents")
async def list_documents(project_id: str, owner=Depends(current_owner)):
    """Document metadata only; the full text stays on the server (tools load it by id)."""
    db = await get_db()
    cursor = db["documents"].find(scope(owner, {"projectId": project_id}), {**HIDDEN, "rawText": 0})
    return await cursor.to_list(length=500)


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str, owner=Depends(current_owner)):
    db = await get_db()
    doc = await db["documents"].find_one(scope(owner, {"id": doc_id}), HIDDEN)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/documents/{project_id}/{doc_id}")
async def delete_document(project_id: str, doc_id: str, owner=Depends(current_owner)):
    db = await get_db()
    await db["documents"].delete_one(scope(owner, {"id": doc_id}))
    await db["artifacts"].delete_many(scope(owner, {"docId": doc_id}))
    await db["projects"].update_one(scope(owner, {"id": project_id}), {"$pull": {"sourceIds": doc_id}})
    return {"status": "success"}


# ── Artifacts ──
@router.get("/projects/{project_id}/artifacts")
async def list_artifacts(project_id: str, docId: str, owner=Depends(current_owner)):
    """All artifacts for one document plus project-level ones, as {tool: data} in one call."""
    db = await get_db()
    cursor = db["artifacts"].find(
        scope(owner, {"projectId": project_id, "docId": {"$in": [docId, PROJECT_LEVEL]}}),
        {"_id": 0, "featureType": 1, "docId": 1, "data": 1},
    )
    out = {}
    for art in await cursor.to_list(length=200):
        # project-level artifacts (synthesis) win over legacy per-document copies
        if art["featureType"] not in out or art["docId"] == PROJECT_LEVEL:
            out[art["featureType"]] = art["data"]
    return out


@router.post("/artifacts")
async def save_artifact(art: ArtifactSchema, owner=Depends(current_owner)):
    db = await get_db()
    await save_artifact_doc(db, owner, art.projectId, art.docId, art.featureType, art.data)
    return {"status": "success"}


# ── Notes ──
@router.post("/notes")
async def save_note(note: NoteSchema, owner=Depends(current_owner)):
    db = await get_db()
    await db["notes"].update_one(scope(owner, {"id": note.id}), {"$set": stamp(owner, note.model_dump())}, upsert=True)
    return {"status": "success"}


@router.get("/notes/{project_id}")
async def list_notes(project_id: str, owner=Depends(current_owner)):
    db = await get_db()
    cursor = db["notes"].find(scope(owner, {"projectId": project_id}), HIDDEN).sort("createdAt", -1)
    return await cursor.to_list(length=500)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, owner=Depends(current_owner)):
    db = await get_db()
    await db["notes"].delete_one(scope(owner, {"id": note_id}))
    return {"status": "success"}
