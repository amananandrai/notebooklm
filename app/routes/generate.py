"""AI endpoints: tool generation (streamed jobs), job status and chat.

Clients send ids, never document text: the server loads the caller's documents
from MongoDB, so text is not re-uploaded on every request and cannot be spoofed.
"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import generators, jobs, llm
from app.db import get_db
from app.routes.storage import PROJECT_LEVEL, save_artifact_doc
from app.schemas import ChatRequest, GenerateRequest
from app.security import current_owner, enforce, scope

router = APIRouter(prefix="/api")


async def _load_doc(db, owner, project_id: str, doc_id: str) -> dict:
    doc = await db["documents"].find_one(scope(owner, {"id": doc_id, "projectId": project_id}),
                                         {"_id": 0, "title": 1, "rawText": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/generate")
async def generate(req: GenerateRequest, request: Request, owner=Depends(current_owner)):
    if req.tool not in generators.TOOLS:
        raise HTTPException(status_code=400, detail=f"Unknown tool '{req.tool}'.")
    db = await get_db()
    options = generators.relevant_options(req.tool, req.options)

    if req.tool in generators.PROJECT_TOOLS:
        cursor = db["documents"].find(scope(owner, {"projectId": req.projectId}), {"_id": 0, "title": 1, "rawText": 1})
        docs = [{"title": d.get("title", ""), "text": d.get("rawText", "") or ""} for d in await cursor.to_list(length=50)]
        if len(docs) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 uploaded sources for cross-document synthesis.")
        text_for_key = "\n␞".join(d["title"] + "\n" + d["text"] for d in docs)
        target_doc = PROJECT_LEVEL
        work = lambda: generators.run_synthesis(docs)  # noqa: E731
    else:
        if not req.docId:
            raise HTTPException(status_code=400, detail="docId is required for this tool.")
        doc = await _load_doc(db, owner, req.projectId, req.docId)
        text_for_key = doc.get("rawText", "") or ""
        target_doc = req.docId
        work = lambda: generators.run_doc_tool(req.tool, doc.get("title", ""), text_for_key, options)  # noqa: E731

    key = jobs.cache_key(owner, req.tool, text_for_key, options)
    cached = None if req.force else await jobs.get_cached(db, key)
    if cached is None:
        await enforce(request, "ai")  # only real AI work counts against the AI limit
    job_id = await jobs.create_job(db, owner, {"projectId": req.projectId, "docId": target_doc, "tool": req.tool})

    async def run() -> dict:
        if cached is not None:
            event = {"type": "result", "data": cached, "cached": True}
        else:
            try:
                def blocking():
                    data = work()
                    return data, llm.last_model()
                data, model = await asyncio.to_thread(blocking)
                event = {"type": "result", "data": data, "cached": False}
                await jobs.put_cached(db, key, req.tool, data, model)
            except Exception as exc:
                print(f"[generate] tool={req.tool} failed: {exc.__class__.__name__}: {exc}")
                event = jobs.error_event(exc)
        try:
            if event["type"] == "result":
                await save_artifact_doc(db, owner, req.projectId, target_doc, req.tool, event["data"])
            await jobs.finish_job(db, job_id, event)
        except Exception as exc:  # persistence failure must not hide the result from the client
            print(f"[generate] could not persist job {job_id}: {exc}")
        return event

    task = jobs.start(run)
    return StreamingResponse(jobs.stream_events(job_id, task), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, owner=Depends(current_owner)):
    db = await get_db()
    job = await jobs.get_job(db, owner, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/chat")
async def chat(req: ChatRequest, request: Request, owner=Depends(current_owner)):
    await enforce(request, "ai")
    db = await get_db()
    doc = await _load_doc(db, owner, req.projectId, req.docId)
    try:
        return await asyncio.to_thread(generators.answer_question, req.question, doc.get("title", ""),
                                       doc.get("rawText", "") or "", req.history)
    except llm.LLMQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)})
    except llm.LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        print(f"[chat] failed: {exc.__class__.__name__}: {exc}")
        raise HTTPException(status_code=502, detail=f"The AI request failed: {exc}")
