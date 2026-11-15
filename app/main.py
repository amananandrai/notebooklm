"""FastAPI application: middleware, routers and status endpoints."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import db, tts
from app.routes import generate, storage
from app.routes import tts as tts_routes
from app.security import authenticate, warn_if_open
from app.settings import settings


@asynccontextmanager
async def lifespan(_app):
    warn_if_open()
    summary = settings.summary()
    print(f"Config: {summary}")
    if not summary["llm"]["configured"]:
        print("WARNING: no LLM API key configured - AI generation will fail until it is set.")
    yield  # MongoDB connects lazily on first use (see app/db.py)
    await db.close()


class BodySizeLimitMiddleware:
    """Reject request bodies over MAX_REQUEST_BYTES, whether or not Content-Length is sent.

    A declared Content-Length is checked up front. Bodies without one (chunked
    transfer) are buffered up to the limit and then replayed to the app.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = settings.max_request_bytes
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            if not declared.isdigit() or int(declared) > limit:
                return await self._reject(scope, send)
            return await self.app(scope, receive, send)
        if scope.get("method") in ("GET", "HEAD", "OPTIONS", "DELETE"):
            return await self.app(scope, receive, send)

        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                return await self._reject(scope, send)
            chunks.append(chunk)
            if not message.get("more_body"):
                break
        body, replayed = b"".join(chunks), False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)

    @staticmethod
    async def _reject(scope, send):
        await JSONResponse({"detail": "Request body too large."}, status_code=413)(scope, None, send)


def create_app() -> FastAPI:
    app = FastAPI(
        title="NotebookLM Studio API",
        version="5.0.0",
        lifespan=lifespan,
        dependencies=[Depends(authenticate)],  # access-key auth + general rate limit on every route
    )
    # Added before CORS so CORS is the outer layer and 413 responses still carry CORS headers.
    app.add_middleware(BodySizeLimitMiddleware)
    # Auth uses a bearer header, not cookies, so credentials are never needed.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/")
    @app.get("/api/health")
    async def status():
        info = settings.summary()
        return {"status": "online", "service": "NotebookLM Studio API", **info,
                "mongodb": "connected" if db.is_connected() else "not connected yet",
                "ttsEngine": tts._tts_backend() or "unavailable"}

    app.include_router(storage.router)
    app.include_router(generate.router)
    app.include_router(tts_routes.router)
    return app


app = create_app()
