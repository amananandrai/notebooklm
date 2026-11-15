"""MongoDB access: lazy, retrying connection plus idempotent index creation.

A failed connection is never pinned for the life of the instance: the next
request after a short back-off tries again. Routes call ``await get_db()``, which
raises HTTP 503 when the database is unreachable (the UI shows its offline banner).
"""
import asyncio
import time
from typing import Optional

from fastapi import HTTPException
from pymongo import ASCENDING, DESCENDING

from app.settings import settings

_db = None
_client = None
_ready = False
_retry_at = 0.0
_lock: Optional[asyncio.Lock] = None
RETRY_BACKOFF_S = 5.0


def set_db(database) -> None:
    """Inject a database (tests, scripts). ``None`` resets to lazy connection."""
    global _db, _ready, _retry_at
    _db, _ready, _retry_at = database, database is not None, 0.0


async def _connect():
    global _client, _db, _ready, _retry_at
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(settings.mongo_uri, serverSelectionTimeoutMS=settings.mongo_timeout_ms)
    try:
        await client.admin.command("ping")
    except Exception as exc:
        client.close()
        _retry_at = time.monotonic() + RETRY_BACKOFF_S
        print(f"WARNING: MongoDB unavailable ({exc.__class__.__name__}); retrying in {RETRY_BACKOFF_S:.0f}s")
        return None
    _client, _db = client, client[settings.mongo_db]
    await ensure_indexes(_db)
    _ready = True
    print(f"Connected to MongoDB: {settings.mongo_db}")
    return _db


async def get_db():
    """The database, connecting on first use. Raises 503 if MongoDB is unreachable."""
    global _lock
    if _ready:
        return _db
    if time.monotonic() < _retry_at:
        raise HTTPException(status_code=503, detail="Database is unavailable. Try again shortly.")
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _ready:
            return _db
        database = await _connect()
    if database is None:
        raise HTTPException(status_code=503, detail="Database is unavailable. Try again shortly.")
    return database


async def try_get_db():
    """Like get_db() but returns None instead of raising (for optional features)."""
    try:
        return await get_db()
    except HTTPException:
        return None


def is_connected() -> bool:
    return _ready


async def close() -> None:
    global _client, _ready
    if _client is not None:
        _client.close()
    _client, _ready = None, False


INDEXES = {
    "projects": [([("ownerId", ASCENDING), ("id", ASCENDING)], {"unique": True})],
    "documents": [
        ([("ownerId", ASCENDING), ("id", ASCENDING)], {"unique": True}),
        ([("ownerId", ASCENDING), ("projectId", ASCENDING)], {}),
    ],
    "artifacts": [
        ([("ownerId", ASCENDING), ("key", ASCENDING)], {"unique": True}),
        ([("ownerId", ASCENDING), ("projectId", ASCENDING), ("docId", ASCENDING)], {}),
    ],
    "notes": [
        ([("ownerId", ASCENDING), ("id", ASCENDING)], {"unique": True}),
        ([("ownerId", ASCENDING), ("projectId", ASCENDING), ("createdAt", DESCENDING)], {}),
    ],
    "generations": [
        ([("cacheKey", ASCENDING)], {"unique": True}),
        ([("createdAt", ASCENDING)], {"expireAfterSeconds": None}),  # TTL filled in below
    ],
    "jobs": [
        ([("jobId", ASCENDING)], {"unique": True}),
        ([("expiresAt", ASCENDING)], {"expireAfterSeconds": 0}),
    ],
    "rate_limits": [
        ([("key", ASCENDING)], {"unique": True}),
        ([("expiresAt", ASCENDING)], {"expireAfterSeconds": 0}),
    ],
}


async def ensure_indexes(database) -> None:
    """Create indexes if missing. Failures (e.g. duplicate legacy data) are logged, not fatal."""
    for collection, specs in INDEXES.items():
        for keys, options in specs:
            opts = dict(options)
            if opts.get("expireAfterSeconds", 0) is None:
                opts["expireAfterSeconds"] = settings.cache_ttl_days * 86400
            try:
                await database[collection].create_index(keys, **opts)
            except Exception as exc:
                print(f"WARNING: could not create index {collection}{keys}: {exc}")
