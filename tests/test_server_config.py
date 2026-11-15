"""Body-size limit without Content-Length, missing Gemini key, and TTS backend selection."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for k in ["APP_ACCESS_KEYS", "VERCEL", "TTS_BACKEND"]:
    os.environ.pop(k, None)
from fastapi.testclient import TestClient
import mcp_server as srv
import security

failures = 0
def check(name, cond):
    global failures
    print(("PASS" if cond else "FAIL"), name)
    failures += 0 if cond else 1

c = TestClient(srv.app)
limit = security.MAX_BODY_BYTES

# Chunked bodies (no Content-Length) used to bypass the size check.
def chunks(total, size=65536):
    sent = 0
    while sent < total:
        n = min(size, total - sent); sent += n
        yield b"x" * n
r = c.post("/api/documents", content=chunks(limit + 1), headers={"content-type": "application/json"})
check("chunked oversize body -> 413", r.status_code == 413)
r = c.post("/mcp", content=iter([b'{"jsonrpc":"2.0","id":1,', b'"method":"tools/list"}']), headers={"content-type": "application/json"})
check("chunked small body still reaches the app", r.status_code == 200 and "tools" in r.json().get("result", {}))
check("declared oversize body -> 413", c.post("/api/documents", content=b"x", headers={"content-length": str(limit + 1)}).status_code == 413)

# Missing Gemini key fails fast with a clear message (and no condense calls).
srv.GEMINI_API_KEY = ""
calls = []
real_urlopen = srv.urllib.request.urlopen
srv.urllib.request.urlopen = lambda *a, **k: calls.append(1)
r = c.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": "generate_report", "arguments": {"rawText": "x" * 200_000}}}).json()
srv.urllib.request.urlopen = real_urlopen
check("missing key -> clear error", "GEMINI_API_KEY is not set" in r.get("error", {}).get("message", ""))
check("missing key -> no network calls", calls == [])
check("root reports gemini missing", c.get("/").json()["gemini"] == "missing")

# TTS backend selection
srv.GEMINI_API_KEY = ""
real_which = srv.shutil.which
srv.shutil.which = lambda name: None
check("no engine -> backend None (non-Windows)", os.name == "nt" or srv._tts_backend() is None)
r = c.post("/api/tts", json={"turns": [{"speaker": "Host A", "text": "hi"}]})
check("no engine -> 503 with guidance", os.name == "nt" or (r.status_code == 503 and "espeak" in r.json()["detail"]))
srv.GEMINI_API_KEY = "k"
check("gemini key -> gemini backend", os.name == "nt" or srv._tts_backend() == "gemini")
os.environ["TTS_BACKEND"] = "nope"
r = c.post("/api/tts", json={"turns": [{"speaker": "Host A", "text": "hi"}]})
check("unknown TTS_BACKEND -> 503", r.status_code == 503 and "Unknown TTS_BACKEND" in r.json()["detail"])
os.environ.pop("TTS_BACKEND")
srv.shutil.which = real_which
check("empty turns -> 400", c.post("/api/tts", json={"turns": []}).status_code == 400)

if real_which("espeak-ng") or real_which("espeak"):
    os.environ["TTS_BACKEND"] = "espeak"
    r = c.post("/api/tts", json={"turns": [{"speaker": "Host A (Alex)", "text": "Hello there."},
                                            {"speaker": "Host B (Jordan)", "text": "Hi Alex."}]})
    os.environ.pop("TTS_BACKEND")
    body = r.json() if r.status_code == 200 else {}
    check("espeak renders a joined WAV", r.status_code == 200 and body.get("engine") == "espeak" and len(body.get("durations", [])) == 2)
else:
    print("SKIP espeak render (espeak-ng not installed)")

# Serverless hosts mount the code read-only: temp files must go to the system temp dir.
import tempfile
os.environ["VERCEL"] = "1"
check("on Vercel, work dir is under the system temp dir", srv._writable_work_dir().startswith(tempfile.gettempdir()))
os.environ.pop("VERCEL")
os.environ["NOTEBOOKLM_WORK_DIR"] = "/custom/dir"
check("NOTEBOOKLM_WORK_DIR overrides the work dir", srv._writable_work_dir() == "/custom/dir")
os.environ.pop("NOTEBOOKLM_WORK_DIR")

print("\nFAILURES:", failures)
sys.exit(1 if failures else 0)
