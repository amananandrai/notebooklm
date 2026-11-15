"""Shared test setup: fresh settings, in-memory MongoDB, stubbed LLM, tiny check runner."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongomock_motor  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as database  # noqa: E402
from app import llm, security  # noqa: E402
from app.settings import reload_settings, settings  # noqa: E402

ENV_KEYS = ["APP_ACCESS_KEYS", "VERCEL", "ALLOWED_ORIGINS", "RATE_LIMIT_STORE", "TTS_BACKEND", "LLM_PROVIDER",
            "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODELS", "GEMINI_API_KEY", "NOTEBOOKLM_WORK_DIR", "MONGO_URI",
            "BLOB_READ_WRITE_TOKEN"]
_real_complete = llm.complete
failures = 0


def make_client(**env):
    """New app with a clean environment, empty fake DB and reset rate limits."""
    from app.main import create_app

    for key in ENV_KEYS:
        os.environ.pop(key, None)
    os.environ.update({"GEMINI_API_KEY": "test-key", **env})
    reload_settings()
    security.memory_store.reset()
    fake = mongomock_motor.AsyncMongoMockClient()["test"]
    database.set_db(fake)
    llm.complete = _real_complete
    return TestClient(create_app()), fake


def A(key):
    return {"Authorization": f"Bearer {key}"}


def project(pid):
    return {"id": pid, "name": "n", "color": "c", "color2": "c", "icon": "i", "createdAt": "x", "updatedAt": "x"}


def check(name, cond):
    global failures
    print(("PASS" if cond else "FAIL"), name)
    failures += 0 if cond else 1


def done():
    print("\nFAILURES:", failures)
    sys.exit(1 if failures else 0)


__all__ = ["make_client", "A", "project", "check", "done", "settings", "llm", "security", "database"]
