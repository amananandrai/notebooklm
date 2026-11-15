"""Generation jobs and the result cache.

A generation runs as a background asyncio task (the blocking LLM work happens in a
worker thread). The HTTP response streams NDJSON events while it runs:

    {"type": "job", "jobId": "..."}                      first, immediately
    {"type": "heartbeat", "elapsed": 10}                 every JOB_HEARTBEAT_S
    {"type": "result", "data": ..., "cached": false}     or
    {"type": "error", "code": "quota"|"not_configured"|"failed", "message": ..., "retryAfter": 60}

Heartbeats keep proxies and mobile networks from dropping a long, silent request.
The task is not tied to the response: if the client disconnects, the work still
finishes and is saved, and ``GET /api/jobs/{id}`` returns the outcome.
Results are cached by (owner, tool, options, model chain, text hash), so asking
again for the same thing costs no AI quota.
"""
import asyncio
import hashlib
import json
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, Optional

from app import llm
from app.security import in_days, utcnow
from app.settings import settings

JOB_MAX_AGE_S = 330  # a job "running" longer than this was interrupted (function limit is 300 s)
_background: set = set()  # strong refs so running tasks are not garbage-collected


def cache_key(owner: Optional[str], tool: str, text: str, options: dict) -> str:
    material = json.dumps({
        "owner": owner or "", "tool": tool, "options": options,
        "provider": settings.llm_provider, "models": settings.models,
        "text": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }, sort_keys=True)
    return hashlib.sha256(material.encode()).hexdigest()


async def get_cached(db, key: str) -> Optional[Any]:
    doc = await db["generations"].find_one({"cacheKey": key}, {"_id": 0, "data": 1})
    return doc["data"] if doc else None


async def put_cached(db, key: str, tool: str, data: Any, model: str) -> None:
    await db["generations"].update_one(
        {"cacheKey": key},
        {"$set": {"cacheKey": key, "tool": tool, "data": data, "model": model, "createdAt": utcnow()}},
        upsert=True,
    )


def error_event(exc: BaseException) -> Dict[str, Any]:
    if isinstance(exc, llm.LLMQuotaError):
        return {"type": "error", "code": "quota", "message": str(exc), "retryAfter": exc.retry_after}
    if isinstance(exc, llm.LLMNotConfigured):
        return {"type": "error", "code": "not_configured", "message": str(exc)}
    if isinstance(exc, ValueError):
        return {"type": "error", "code": "bad_request", "message": str(exc)}
    return {"type": "error", "code": "failed", "message": f"Generation failed: {exc}"}


async def create_job(db, owner: Optional[str], meta: dict) -> str:
    job_id = uuid.uuid4().hex
    doc = {"jobId": job_id, "status": "running", "createdAt": utcnow(), "updatedAt": utcnow(),
           "expiresAt": in_days(1), **meta}
    if owner:
        doc["ownerId"] = owner
    await db["jobs"].insert_one(doc)
    return job_id


async def finish_job(db, job_id: str, event: dict) -> None:
    update = {"updatedAt": utcnow()}
    if event["type"] == "result":
        update.update(status="done", result=event["data"], cached=event.get("cached", False))
    else:
        update.update(status="error", error={k: v for k, v in event.items() if k != "type"})
    await db["jobs"].update_one({"jobId": job_id}, {"$set": update})


async def get_job(db, owner: Optional[str], job_id: str) -> Optional[dict]:
    query = {"jobId": job_id, **({"ownerId": owner} if owner else {})}
    job = await db["jobs"].find_one(query, {"_id": 0, "ownerId": 0, "expiresAt": 0})
    if job and job["status"] == "running":
        created = job["createdAt"]
        age = (utcnow() - (created if created.tzinfo else created.replace(tzinfo=utcnow().tzinfo))).total_seconds()
        if age > JOB_MAX_AGE_S:
            job.update(status="error", error={"code": "interrupted", "message": "The job was interrupted. Please try again."})
    for key in ("createdAt", "updatedAt"):
        if job and hasattr(job.get(key), "isoformat"):
            job[key] = job[key].isoformat()
    return job


def start(work: Callable[[], Awaitable[dict]]) -> "asyncio.Task":
    """Run `work` (returns a result/error event) as a detached background task."""
    task = asyncio.create_task(work())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return task


async def stream_events(job_id: str, task: "asyncio.Task"):
    """Async iterator of NDJSON lines for a running job."""
    started = time.monotonic()
    yield json.dumps({"type": "job", "jobId": job_id}) + "\n"
    while True:
        done, _ = await asyncio.wait({task}, timeout=settings.job_heartbeat_s)
        if done:
            break
        yield json.dumps({"type": "heartbeat", "elapsed": round(time.monotonic() - started)}) + "\n"
    try:
        event = task.result()
    except Exception as exc:  # the worker already converts errors; this is a last resort
        event = error_event(exc)
    yield json.dumps({**event, "jobId": job_id}) + "\n"
