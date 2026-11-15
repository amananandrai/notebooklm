"""New API: generation by id with caching, jobs, error mapping, synthesis, batch
artifacts, chat, LLM providers (fake HTTP servers) and Blob image storage."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from helpers import check, done, make_client, project, settings
from app import images, llm

calls = []


def fake_complete(prompt, json_mode=False, expect="object", models=None):
    calls.append((prompt[:40], json_mode, expect))
    if "cross-document synthesis" in prompt:
        return json.dumps({"synthesisTitle": "S", "overallSynthesis": "o"})
    if "document assistant" in prompt:
        return "The budget was 7.3 million euros [Page 3]."
    return json.dumps({"reportTitle": "R", "n": len(calls)})


def events_of(resp):
    return [json.loads(line) for line in resp.text.splitlines() if line.strip()]


PAGES = "\n--- Page 1 ---\nIntro text about solar.\n--- Page 2 ---\nStorage.\n--- Page 3 ---\nThe zeppelin budget was 7.3 million euros."

c, db = make_client()
c.post("/api/projects", json=project("p"))
c.post("/api/documents", json={"id": "d1", "projectId": "p", "title": "report.pdf", "rawText": PAGES})
c.post("/api/documents", json={"id": "d2", "projectId": "p", "title": "wind.pdf", "rawText": "Wind farms."})
llm.complete = fake_complete

docs = c.get("/api/projects/p/documents").json()
check("document list omits rawText", len(docs) == 2 and all("rawText" not in d for d in docs))

# generate -> result, artifact saved by the server, cached afterwards
r = c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "report"})
ev = events_of(r)
check("generate streams job then result", r.status_code == 200 and ev[0]["type"] == "job" and ev[-1]["type"] == "result"
      and ev[-1]["data"]["reportTitle"] == "R" and ev[-1]["cached"] is False)
check("report requested JSON mode", calls[-1][1] is True and calls[-1][2] == "object")
arts = c.get("/api/projects/p/artifacts?docId=d1").json()
check("server saved the artifact", arts.get("report", {}).get("reportTitle") == "R")
n_calls = len(calls)
ev2 = events_of(c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "report"}))
check("second request served from cache (no AI call)", ev2[-1]["cached"] is True and len(calls) == n_calls)
ev3 = events_of(c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "report", "force": True}))
check("force=true regenerates", ev3[-1]["cached"] is False and len(calls) == n_calls + 1)
job = c.get(f"/api/jobs/{ev3[0]['jobId']}").json()
check("job status endpoint returns the finished result", job["status"] == "done" and job["result"]["reportTitle"] == "R")
check("unknown job -> 404", c.get("/api/jobs/nope").status_code == 404)

# options only affect the tools that use them
c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "audio", "options": {"audioLength": "quick"}})
check("array tools use expect=array", calls[-1][2] == "array")
n_calls = len(calls)
ev = events_of(c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "report", "options": {"theme": "dark_obsidian"}}))
check("irrelevant options keep the cache hit", ev[-1]["cached"] is True and len(calls) == n_calls)

# errors
check("unknown tool -> 400", c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "nope"}).status_code == 400)
check("missing doc -> 404", c.post("/api/generate", json={"projectId": "p", "docId": "zz", "tool": "report"}).status_code == 404)


def quota(*a, **k):
    raise llm.LLMQuotaError("quota exhausted", retry_after=42)


llm.complete = quota
ev = events_of(c.post("/api/generate", json={"projectId": "p", "docId": "d1", "tool": "mindmap"}))
check("quota error becomes a clear event", ev[-1]["type"] == "error" and ev[-1]["code"] == "quota" and ev[-1]["retryAfter"] == 42)
r = c.post("/api/chat", json={"projectId": "p", "docId": "d1", "question": "q"})
check("chat quota error -> 429 + Retry-After", r.status_code == 429 and r.headers.get("retry-after") == "42")
llm.complete = fake_complete

# synthesis is project-level
ev = events_of(c.post("/api/generate", json={"projectId": "p", "tool": "synthesis"}))
check("synthesis over the project's documents", ev[-1]["type"] == "result" and ev[-1]["data"]["synthesisTitle"] == "S")
check("synthesis visible from any document", c.get("/api/projects/p/artifacts?docId=d2").json().get("synthesis", {}).get("synthesisTitle") == "S")
c.post("/api/projects", json=project("solo"))
c.post("/api/documents", json={"id": "s1", "projectId": "solo", "rawText": "x"})
check("synthesis needs 2 documents", c.post("/api/generate", json={"projectId": "solo", "tool": "synthesis"}).status_code == 400)

# chat loads the text server-side and cites pages
r = c.post("/api/chat", json={"projectId": "p", "docId": "d1", "question": "What was the zeppelin budget?"})
body = r.json()
check("chat answers with a page citation", r.status_code == 200 and body["citations"] and body["citations"][0]["page"] == 3)

# deleting a document removes its artifacts
c.delete("/api/documents/p/d1")
check("artifacts removed with their document", "report" not in c.get("/api/projects/p/artifacts?docId=d1").json())


# ── LLM providers against fake HTTP servers ─────────────────────────────────
class Fake(BaseHTTPRequestHandler):
    seen = []
    fail_first = 0

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.seen.append((self.path, {k.lower(): v for k, v in self.headers.items()}, body))
        if Fake.fail_first:
            Fake.fail_first -= 1
            self.send_response(429)
            self.send_header("Retry-After", "0")
            self.end_headers()
            return
        if self.path.endswith("/chat/completions"):
            out = {"choices": [{"message": {"content": '{"ok": true}'}}]}
        elif self.path.endswith("/v1/messages"):
            out = {"content": [{"type": "text", "text": '{"ok": "claude"}'}]}
        else:
            out = {"candidates": [{"content": {"parts": [{"text": '{"ok": "gemini"}'}]}}]}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        Fake.seen.append((self.path, {k.lower(): v for k, v in self.headers.items()}, None))
        data = json.dumps({"url": "https://blob.example/stored.jpg"}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        Fake.seen.append((self.path, {k.lower(): v for k, v in self.headers.items()}, None))
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.end_headers()
        self.wfile.write(b"\xff\xd8fakejpeg")

    def log_message(self, *a):
        pass


server = HTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
import os  # noqa: E402
os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"

make_client(LLM_PROVIDER="openai_compat", LLM_BASE_URL=base + "/v1", LLM_API_KEY="sk-test", LLM_MODELS="m1,m2")
Fake.seen.clear()
Fake.fail_first = 1
text, model = llm.complete_with_model("hi", json_mode=True, expect="object")
path, headers, body = Fake.seen[-1]
check("openai_compat: retried 429, then answered", text == '{"ok": true}' and model == "m1" and len(Fake.seen) == 2)
check("openai_compat: bearer key, model, json_object mode",
      headers.get("authorization") == "Bearer sk-test" and body["model"] == "m1" and body["response_format"] == {"type": "json_object"})
llm.complete("hi", json_mode=True, expect="array")
check("openai_compat: no json_object for array tools", "response_format" not in Fake.seen[-1][2])

make_client(LLM_PROVIDER="anthropic", LLM_API_KEY="ant-test", LLM_MODELS="claude-x")
import app.llm as llm_mod  # noqa: E402
real_post = llm_mod._post
llm_mod._post = lambda url, headers, body: real_post(base + "/v1/messages", headers, body)
text = llm.complete("hi")
path, headers, body = Fake.seen[-1]
check("anthropic: x-api-key + version header, text joined", text == '{"ok": "claude"}' and headers.get("x-api-key") == "ant-test"
      and headers.get("anthropic-version") == "2023-06-01" and body["model"] == "claude-x")

make_client(LLM_MODELS="g1")
llm_mod._post = lambda url, headers, body: real_post(base + "/gemini", headers, body)
text = llm.complete("hi", json_mode=True)
path, headers, body = Fake.seen[-1]
check("gemini: x-goog-api-key + responseMimeType JSON", text == '{"ok": "gemini"}' and headers.get("x-goog-api-key") == "test-key"
      and body["generationConfig"]["responseMimeType"] == "application/json")

Fake.fail_first = 6
make_client(LLM_PROVIDER="openai_compat", LLM_BASE_URL=base + "/v1", LLM_API_KEY="k", LLM_MODELS="a,b")
llm_mod._post = real_post
t0 = time.monotonic()
try:
    llm.complete("hi")
    check("all models rate-limited -> LLMQuotaError", False)
except llm.LLMQuotaError as exc:
    check("all models rate-limited -> LLMQuotaError", exc.retry_after >= 30 and time.monotonic() - t0 < 30)
Fake.fail_first = 0

# ── Images: stored in Blob when a token is configured, else Pollinations URL ──
make_client()
url = images.image_for_prompt("a lighthouse", 1280, 720, 1)
check("no Blob token -> Pollinations URL without ignored params",
      url.startswith(images.POLLINATIONS) and "model=" not in url and "nologo" not in url)
make_client(BLOB_READ_WRITE_TOKEN="vercel_blob_rw_STOREID_secret")
images.POLLINATIONS, images.BLOB_API = base + "/prompt/", base + "/api/blob/"
Fake.seen.clear()
url = images.image_for_prompt("a lighthouse", 1280, 720, 1)
put = [s for s in Fake.seen if s[0].startswith("/api/blob/")]
check("Blob token -> image downloaded and stored, Blob URL returned", url == "https://blob.example/stored.jpg" and len(put) == 1)
h = put[0][1] if put else {}
check("Blob upload uses the @vercel/blob protocol headers",
      h.get("authorization") == "Bearer vercel_blob_rw_STOREID_secret" and h.get("x-api-version") == "13"
      and h.get("x-vercel-blob-store-id") == "STOREID" and h.get("x-vercel-blob-access") == "public"
      and "pathname=notebooklm%2Fimages%2F" in put[0][0])
images.BLOB_API = base + "/missing-blob-host-404/"
server.RequestHandlerClass.do_PUT = lambda self: (self.send_response(500), self.end_headers())
url = images.image_for_prompt("a lighthouse", 1280, 720, 2)
check("Blob failure falls back to the Pollinations URL", url.startswith(images.POLLINATIONS))

print(f"(settings provider now {settings.llm_provider})")
done()
