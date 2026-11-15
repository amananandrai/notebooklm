"""Authentication and rate limiting for the NotebookLM API.

Auth model
----------
Access keys are configured with the ``APP_ACCESS_KEYS`` environment variable
(comma separated, one key per person/team). Clients send
``Authorization: Bearer <key>``. Each key maps to a stable *owner id*
(a truncated SHA-256 of the key) which scopes all stored data, so two people
using different keys never see each other's projects.

* Keys configured          -> every ``/api`` and ``/mcp`` request needs a valid key.
* No keys, running locally -> auth is disabled (development convenience) and a
                              warning is logged.
* No keys, on Vercel       -> fail closed: requests are refused with 503 until
                              keys are configured.

Rate limiting
-------------
Fixed in-memory sliding windows keyed by owner (or client IP when auth is off).
This protects a single server process. On serverless hosts each instance has
its own counters, so put a shared limiter (e.g. Redis/Upstash) in front for a
hard global cap.
"""
import hashlib
import hmac
import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

ON_VERCEL = bool(os.getenv("VERCEL"))
PUBLIC_PATHS = {"/"}


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# ── Access keys ──────────────────────────────────────────────────────────────

def owner_id_for(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def _load_keys() -> Dict[str, str]:
    raw = os.getenv("APP_ACCESS_KEYS", "")
    return {owner_id_for(k.strip()): k.strip() for k in raw.split(",") if k.strip()}


ACCESS_KEYS: Dict[str, str] = _load_keys()  # owner id -> key


def auth_mode() -> str:
    if ACCESS_KEYS:
        return "enabled"
    return "misconfigured" if ON_VERCEL else "disabled"


def warn_if_open() -> None:
    mode = auth_mode()
    if mode == "disabled":
        print("WARNING: APP_ACCESS_KEYS is not set - API authentication is DISABLED (local development only).")
    elif mode == "misconfigured":
        print("ERROR: APP_ACCESS_KEYS is not set on Vercel - all API requests will be refused until it is configured.")


def _match_key(presented: str) -> Optional[str]:
    """Constant-time check against every configured key; returns the owner id."""
    found = None
    for owner, key in ACCESS_KEYS.items():
        if hmac.compare_digest(key.encode("utf-8"), presented.encode("utf-8")):
            found = owner
    return found


# ── Rate limiting ────────────────────────────────────────────────────────────

class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def hit(self, bucket: str, identity: str, limit: int, window: float) -> Optional[int]:
        """Record a request. Returns None if allowed, else seconds until retry."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[(bucket, identity)]
            while q and now - q[0] >= window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])) + 1)
            q.append(now)
            self._sweep(now, window)
            return None

    def blocked(self, bucket: str, identity: str, limit: int, window: float) -> Optional[int]:
        """Like hit() but read-only: seconds until retry if already at the limit."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.get((bucket, identity))
            if not q:
                return None
            while q and now - q[0] >= window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])) + 1)
            return None

    def _sweep(self, now: float, window: float) -> None:
        # Drop idle identities occasionally so the table cannot grow forever.
        if now - self._last_sweep < 300:
            return
        self._last_sweep = now
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] > 7200]:
            del self._hits[k]


limiter = SlidingWindowLimiter()

# bucket -> list of (max requests, window seconds); all must pass.
LIMITS = {
    "general": [(_int_env("RATE_LIMIT_GENERAL_PER_MIN", 240), 60)],
    "ai": [(_int_env("RATE_LIMIT_AI_PER_MIN", 20), 60), (_int_env("RATE_LIMIT_AI_PER_HOUR", 200), 3600)],
    "tts": [(_int_env("RATE_LIMIT_TTS_PER_MIN", 10), 60)],
    # Failed authentication attempts, per client IP (brute-force protection).
    "auth_fail": [(_int_env("RATE_LIMIT_AUTH_FAIL_PER_5MIN", 10), 300)],
}
MAX_BODY_BYTES = _int_env("MAX_REQUEST_BYTES", 8 * 1024 * 1024)
MAX_DOC_CHARS = _int_env("MAX_DOCUMENT_CHARS", 600_000)


def client_ip(request: Request) -> str:
    # Only trust X-Forwarded-For behind a proxy we control (Vercel / explicit opt-in).
    if ON_VERCEL or os.getenv("TRUST_PROXY") == "1":
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _too_many(retry: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=f"Too many requests. Try again in {retry}s.",
        headers={"Retry-After": str(retry)},
    )


def _identity(request: Request) -> str:
    owner = getattr(request.state, "owner", None)
    return f"u:{owner}" if owner else f"ip:{client_ip(request)}"


def enforce(request: Request, bucket: str) -> None:
    """Apply every window of `bucket` to the caller, raising 429 when exceeded."""
    identity = _identity(request)
    for limit, window in LIMITS[bucket]:
        retry = limiter.hit(f"{bucket}:{limit}/{window}", identity, limit, window)
        if retry is not None:
            raise _too_many(retry)


def limit(bucket: str):
    """FastAPI dependency factory: ``Depends(limit("render"))``."""
    async def dependency(request: Request) -> None:
        enforce(request, bucket)
    return dependency


# ── Authentication dependency ────────────────────────────────────────────────

async def authenticate(request: Request) -> None:
    """Global dependency: identify the caller and apply the general rate limit."""
    request.state.owner = None
    if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
        return

    mode = auth_mode()
    if mode == "misconfigured":
        raise HTTPException(status_code=503, detail="Server authentication is not configured.")

    if mode == "enabled":
        ip = client_ip(request)
        # Once an IP has failed too often, refuse it outright (even with a correct key)
        # so keys cannot be brute-forced.
        for lim, window in LIMITS["auth_fail"]:
            retry = limiter.blocked("auth_fail", ip, lim, window)
            if retry is not None:
                raise _too_many(retry)
        header = request.headers.get("authorization", "")
        presented = header[7:].strip() if header.lower().startswith("bearer ") else ""
        owner = _match_key(presented) if presented else None
        if owner is None:
            for lim, window in LIMITS["auth_fail"]:
                limiter.hit("auth_fail", ip, lim + 1, window)  # record the failure
            raise HTTPException(
                status_code=401,
                detail="A valid access key is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        request.state.owner = owner

    enforce(request, "general")


def current_owner(request: Request) -> Optional[str]:
    """Owner id of the caller, or None when auth is disabled (no data scoping)."""
    return getattr(request.state, "owner", None)


def scope(owner: Optional[str], query: dict) -> dict:
    """Restrict a Mongo filter to the caller's data."""
    return {**query, "ownerId": owner} if owner else query


def stamp(owner: Optional[str], doc: dict) -> dict:
    """Record the owner on a document being written."""
    return {**doc, "ownerId": owner} if owner else doc
