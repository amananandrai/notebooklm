"""Authentication and rate limiting.

Auth model
----------
Access keys come from ``APP_ACCESS_KEYS`` (comma separated, one per person/team).
Clients send ``Authorization: Bearer <key>``. Each key maps to a stable owner id
(truncated SHA-256) which scopes all stored data.

* Keys configured          -> every /api request needs a valid key.
* No keys, running locally -> auth disabled (development) with a warning.
* No keys, on Vercel       -> fail closed: 503 until keys are configured.

Rate limiting
-------------
Fixed windows per (bucket, identity). The counter store is pluggable:

* ``memory`` - per process; fine locally, NOT shared between serverless instances.
* ``mongo``  - shared through a ``rate_limits`` collection with a TTL index, so the
  limits hold across every Vercel instance.
* ``auto``   - mongo on Vercel, memory elsewhere. If the shared store is
  unreachable a request falls back to the memory store rather than failing.
"""
import hashlib
import hmac
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, Request
from pymongo import ReturnDocument

from app import db as database
from app.settings import settings

PUBLIC_PATHS = {"/", "/api/health"}


def owner_id_for(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def access_keys() -> Dict[str, str]:
    """owner id -> key, from current settings."""
    return {owner_id_for(k): k for k in settings.app_access_keys}


def auth_mode() -> str:
    if settings.app_access_keys:
        return "enabled"
    return "misconfigured" if settings.on_vercel else "disabled"


def warn_if_open() -> None:
    mode = auth_mode()
    if mode == "disabled":
        print("WARNING: APP_ACCESS_KEYS is not set - API authentication is DISABLED (local development only).")
    elif mode == "misconfigured":
        print("ERROR: APP_ACCESS_KEYS is not set on Vercel - all API requests will be refused until it is configured.")


def _match_key(presented: str) -> Optional[str]:
    """Constant-time comparison against every configured key; returns the owner id."""
    found = None
    for owner, key in access_keys().items():
        if hmac.compare_digest(key.encode("utf-8"), presented.encode("utf-8")):
            found = owner
    return found


# ── Counter stores ───────────────────────────────────────────────────────────

class MemoryStore:
    """Fixed-window counters in this process."""

    def __init__(self) -> None:
        self._counts: Dict[str, Tuple[int, int]] = {}  # "key:window" -> (slot, count)
        self._lock = threading.Lock()
        self._last_sweep = time.time()

    async def incr(self, key: str, window: int, now: float) -> int:
        slot, k = int(now // window), f"{key}:{window}"
        with self._lock:
            prev_slot, count = self._counts.get(k, (slot, 0))
            count = count + 1 if prev_slot == slot else 1
            self._counts[k] = (slot, count)
            self._sweep(now)
            return count

    async def peek(self, key: str, window: int, now: float) -> int:
        with self._lock:
            slot, count = self._counts.get(f"{key}:{window}", (None, 0))
            return count if slot == int(now // window) else 0

    def _sweep(self, now: float) -> None:
        # Drop counters whose window has passed so the table cannot grow forever.
        if now - self._last_sweep < 300:
            return
        self._last_sweep = now
        for k in list(self._counts):
            window = int(k.rsplit(":", 1)[1])
            if self._counts[k][0] < int(now // window):
                del self._counts[k]

    def reset(self) -> None:
        with self._lock:
            self._counts.clear()


class MongoStore:
    """Fixed-window counters shared across instances via MongoDB (TTL-expired)."""

    async def incr(self, key: str, window: int, now: float) -> int:
        db = await database.get_db()
        slot = int(now // window)
        expires = datetime.fromtimestamp((slot + 1) * window + 60, tz=timezone.utc)
        doc = await db["rate_limits"].find_one_and_update(
            {"key": f"{key}:{window}:{slot}"},
            {"$inc": {"count": 1}, "$setOnInsert": {"expiresAt": expires}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc["count"])

    async def peek(self, key: str, window: int, now: float) -> int:
        db = await database.get_db()
        doc = await db["rate_limits"].find_one({"key": f"{key}:{window}:{int(now // window)}"})
        return int(doc["count"]) if doc else 0


memory_store = MemoryStore()
mongo_store = MongoStore()


def _store():
    mode = settings.rate_limit_store
    if mode == "mongo" or (mode == "auto" and settings.on_vercel):
        return mongo_store
    return memory_store


async def _incr(key: str, window: int, now: float) -> int:
    store = _store()
    try:
        return await store.incr(key, window, now)
    except Exception as exc:  # shared store down: degrade to per-instance limits
        if store is not memory_store:
            print(f"WARNING: rate-limit store unavailable ({exc.__class__.__name__}); using memory")
        return await memory_store.incr(key, window, now)


async def _peek(key: str, window: int, now: float) -> int:
    store = _store()
    try:
        return await store.peek(key, window, now)
    except Exception:
        return await memory_store.peek(key, window, now)


def limits() -> Dict[str, list]:
    """bucket -> [(max requests, window seconds)]; every window must pass."""
    s = settings
    return {
        "general": [(s.rate_limit_general_per_min, 60)],
        "ai": [(s.rate_limit_ai_per_min, 60), (s.rate_limit_ai_per_hour, 3600)],
        "tts": [(s.rate_limit_tts_per_min, 60)],
        "auth_fail": [(s.rate_limit_auth_fail_per_5min, 300)],
    }


def client_ip(request: Request) -> str:
    # Only trust X-Forwarded-For behind a proxy we control (Vercel / explicit opt-in).
    if settings.on_vercel or settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _too_many(retry: int) -> HTTPException:
    return HTTPException(status_code=429, detail=f"Too many requests. Try again in {retry}s.",
                         headers={"Retry-After": str(retry)})


def _retry_after(window: int, now: float) -> int:
    return max(1, int(window - (now % window)) + 1)


def _identity(request: Request) -> str:
    owner = getattr(request.state, "owner", None)
    return f"u:{owner}" if owner else f"ip:{client_ip(request)}"


async def enforce(request: Request, bucket: str) -> None:
    """Count this request against every window of `bucket`; 429 when over."""
    identity, now = _identity(request), time.time()
    for limit_, window in limits()[bucket]:
        count = await _incr(f"{bucket}:{identity}", window, now)
        if count > limit_:
            raise _too_many(_retry_after(window, now))


def limit(bucket: str):
    """FastAPI dependency factory: ``Depends(limit("tts"))``."""
    async def dependency(request: Request) -> None:
        await enforce(request, bucket)
    return dependency


async def authenticate(request: Request) -> None:
    """Global dependency: identify the caller and apply the general rate limit."""
    request.state.owner = None
    if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
        return

    mode = auth_mode()
    if mode == "misconfigured":
        raise HTTPException(status_code=503, detail="Server authentication is not configured.")

    if mode == "enabled":
        ip, now = client_ip(request), time.time()
        # Once an IP has failed too often, refuse it outright (even with a correct key).
        for lim, window in limits()["auth_fail"]:
            if await _peek(f"auth_fail:ip:{ip}", window, now) >= lim:
                raise _too_many(_retry_after(window, now))
        header = request.headers.get("authorization", "")
        presented = header[7:].strip() if header.lower().startswith("bearer ") else ""
        owner = _match_key(presented) if presented else None
        if owner is None:
            for _lim, window in limits()["auth_fail"]:
                await _incr(f"auth_fail:ip:{ip}", window, now)
            raise HTTPException(status_code=401, detail="A valid access key is required.",
                                headers={"WWW-Authenticate": "Bearer"})
        request.state.owner = owner

    await enforce(request, "general")


def current_owner(request: Request) -> Optional[str]:
    """Owner id of the caller, or None when auth is disabled (no data scoping)."""
    return getattr(request.state, "owner", None)


def scope(owner: Optional[str], query: dict) -> dict:
    """Restrict a Mongo filter to the caller's data."""
    return {**query, "ownerId": owner} if owner else query


def stamp(owner: Optional[str], doc: dict) -> dict:
    """Record the owner on a document being written."""
    return {**doc, "ownerId": owner} if owner else doc


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def in_days(days: float) -> datetime:
    return utcnow() + timedelta(days=days)
