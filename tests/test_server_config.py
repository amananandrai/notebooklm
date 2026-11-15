"""Body-size limit without Content-Length, settings validation, missing LLM key, TTS selection, work dir."""
import json
import os
import tempfile

from helpers import check, done, make_client, settings
from app import llm, tts
from app.settings import reload_settings

c, db = make_client()
c.post("/api/projects", json={"id": "p", "name": "n", "color": "c", "color2": "c", "icon": "i", "createdAt": "x", "updatedAt": "x"})
c.post("/api/documents", json={"id": "d", "projectId": "p", "rawText": "x" * 200_000})
limit = settings.max_request_bytes


# Chunked bodies (no Content-Length) must not bypass the size check.
def chunks(total, size=65536):
    sent = 0
    while sent < total:
        n = min(size, total - sent)
        sent += n
        yield b"x" * n


r = c.post("/api/documents", content=chunks(limit + 1), headers={"content-type": "application/json"})
check("chunked oversize body -> 413", r.status_code == 413)
r = c.post("/api/notes", content=iter([b'{"id":"n1","projectId":"p","title":"t",', b'"content":"c","createdAt":"x","updatedAt":"x"}']),
           headers={"content-type": "application/json"})
check("chunked small body still reaches the app", r.status_code == 200)
check("declared oversize body -> 413", c.post("/api/documents", content=b"x", headers={"content-length": str(limit + 1)}).status_code == 413)
check("default body limit fits under Vercel's 4.5 MB cap", settings.max_request_bytes <= 4_500_000)

# Missing LLM key: clear error event, and no network calls (no wasted condense calls).
c, db = make_client(GEMINI_API_KEY="")
c.post("/api/projects", json={"id": "p", "name": "n", "color": "c", "color2": "c", "icon": "i", "createdAt": "x", "updatedAt": "x"})
c.post("/api/documents", json={"id": "d", "projectId": "p", "rawText": "x" * 200_000})
calls = []
real_post = llm._post
llm._post = lambda *a, **k: calls.append(1)
r = c.post("/api/generate", json={"projectId": "p", "docId": "d", "tool": "report"})
events = [json.loads(line) for line in r.text.splitlines() if line.strip()]
llm._post = real_post
check("missing key -> not_configured error event", events[-1].get("type") == "error" and events[-1].get("code") == "not_configured"
      and "GEMINI_API_KEY" in events[-1].get("message", ""))
check("missing key -> no network calls", calls == [])
check("health reports LLM not configured", c.get("/api/health").json()["llm"]["configured"] is False)

# Settings validation and provider selection
c, db = make_client(LLM_PROVIDER="OpenAI_Compat", LLM_BASE_URL="", LLM_API_KEY="k", LLM_MODELS=" m1 , m2 ")
check("provider is normalised, models parsed from CSV", settings.llm_provider == "openai_compat" and settings.models == ["m1", "m2"])
try:
    llm.require_configured()
    check("openai_compat without LLM_BASE_URL is rejected", False)
except llm.LLMNotConfigured as exc:
    check("openai_compat without LLM_BASE_URL is rejected", "LLM_BASE_URL" in str(exc))
c, db = make_client(LLM_PROVIDER="nope", LLM_API_KEY="k", LLM_MODELS="m")
try:
    llm.require_configured()
    check("unknown provider is rejected", False)
except llm.LLMNotConfigured as exc:
    check("unknown provider is rejected", "Unknown LLM_PROVIDER" in str(exc))
c, db = make_client(LLM_PROVIDER="anthropic", GEMINI_API_KEY="g")
check("non-gemini provider does not use GEMINI_API_KEY", settings.llm_key == "")

# TTS backend selection
c, db = make_client(GEMINI_API_KEY="")
real_which = tts.shutil.which
tts.shutil.which = lambda name: None
check("no engine -> backend None (non-Windows)", os.name == "nt" or tts._tts_backend() is None)
r = c.post("/api/tts", json={"turns": [{"speaker": "Host A", "text": "hi"}]})
check("no engine -> 503 with guidance", os.name == "nt" or (r.status_code == 503 and "espeak" in r.json()["detail"]))
os.environ["GEMINI_API_KEY"] = "k"
reload_settings()
check("gemini key -> gemini backend", os.name == "nt" or tts._tts_backend() == "gemini")
os.environ["TTS_BACKEND"] = "nope"
reload_settings()
r = c.post("/api/tts", json={"turns": [{"speaker": "Host A", "text": "hi"}]})
check("unknown TTS_BACKEND -> 503", r.status_code == 503 and "Unknown TTS_BACKEND" in r.json()["detail"])
os.environ.pop("TTS_BACKEND")
reload_settings()
tts.shutil.which = real_which
check("empty turns -> 400", c.post("/api/tts", json={"turns": []}).status_code == 400)

if real_which("espeak-ng") or real_which("espeak"):
    os.environ["TTS_BACKEND"] = "espeak"
    reload_settings()
    r = c.post("/api/tts", json={"turns": [{"speaker": "Host A (Alex)", "text": "Hello there."},
                                            {"speaker": "Host B (Jordan)", "text": "Hi Alex."}]})
    os.environ.pop("TTS_BACKEND")
    reload_settings()
    body = r.json() if r.status_code == 200 else {}
    check("espeak renders a joined WAV", r.status_code == 200 and body.get("engine") == "espeak" and len(body.get("durations", [])) == 2)
else:
    print("SKIP espeak render (espeak-ng not installed)")

# Serverless hosts mount the code read-only: temp files must go to the system temp dir.
make_client(VERCEL="1")
check("on Vercel, work dir is under the system temp dir", settings.work_dir.startswith(tempfile.gettempdir()))
make_client(NOTEBOOKLM_WORK_DIR="/custom/dir")
check("NOTEBOOKLM_WORK_DIR overrides the work dir", settings.work_dir == "/custom/dir")

done()
