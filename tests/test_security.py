import os, sys, importlib, asyncio, types
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient

class Cursor:
    def __init__(s, docs): s.docs = docs
    def sort(s, k, d=1): s.docs.sort(key=lambda x: x.get(k, ""), reverse=(d == -1)); return s
    async def to_list(s, length=None): return s.docs[:length]

def matches(doc, q): return all(doc.get(k) == v for k, v in q.items())
def project(doc, proj):
    d = dict(doc)
    for k, v in (proj or {}).items():
        if v == 0: d.pop(k, None)
    return d

class Coll:
    def __init__(s): s.docs = []
    def find(s, q, proj=None): return Cursor([project(d, proj) for d in s.docs if matches(d, q)])
    async def find_one(s, q, proj=None):
        for d in s.docs:
            if matches(d, q): return project(d, proj)
    async def update_one(s, q, upd, upsert=False):
        for d in s.docs:
            if matches(d, q):
                d.update(upd.get("$set", {}))
                for k, v in upd.get("$addToSet", {}).items():
                    d.setdefault(k, []); (v not in d[k]) and d[k].append(v)
                for k, v in upd.get("$pull", {}).items():
                    d[k] = [x for x in d.get(k, []) if x != v]
                return
        if upsert: s.docs.append({**q, **upd.get("$set", {})})
    async def delete_one(s, q):
        for d in s.docs:
            if matches(d, q): s.docs.remove(d); return
    async def delete_many(s, q): s.docs[:] = [d for d in s.docs if not matches(d, q)]

class FakeDB(dict):
    def __missing__(s, k): s[k] = Coll(); return s[k]

def load(**env):
    for k in ["APP_ACCESS_KEYS", "VERCEL", "ALLOWED_ORIGINS"]: os.environ.pop(k, None)
    os.environ.update(env)
    import security, mcp_server
    importlib.reload(security); importlib.reload(mcp_server)
    mcp_server.db = FakeDB()
    return security, mcp_server, TestClient(mcp_server.app)

def A(k): return {"Authorization": f"Bearer {k}"}
proj = lambda i: {"id": i, "name": "n", "color": "c", "color2": "c", "icon": "i", "createdAt": "x", "updatedAt": "x"}
ok = 0
def check(name, cond):
    global ok
    print(("PASS" if cond else "FAIL"), name); ok += 0 if cond else 1

# ---- auth enabled ----
sec, srv, c = load(APP_ACCESS_KEYS="keyAAAA,keyBBBB")
check("root is public", c.get("/").status_code == 200 and c.get("/").json()["auth"] == "enabled")
check("no key -> 401", c.get("/api/projects").status_code == 401)
check("wrong key -> 401", c.get("/api/projects", headers=A("nope")).status_code == 401)
check("mcp no key -> 401", c.post("/mcp", json={"jsonrpc": "2.0", "method": "tools/list"}).status_code == 401)
check("valid key -> 200", c.get("/api/projects", headers=A("keyAAAA")).status_code == 200)
check("tts needs auth", c.post("/api/tts", json={"turns": []}).status_code == 401)
check("removed render endpoints are gone", all(c.post(u, json={}, headers=A("keyAAAA")).status_code in (404, 405) for u in ("/api/videos/render", "/api/hyperframes/render")))

# isolation
c.post("/api/projects", json=proj("p1"), headers=A("keyAAAA"))
c.post("/api/documents", json={"id": "d1", "projectId": "p1", "rawText": "hello"}, headers=A("keyAAAA"))
c.post("/api/artifacts", json={"key": "p1_d1_chat", "projectId": "p1", "docId": "d1", "featureType": "chat", "data": [1]}, headers=A("keyAAAA"))
c.post("/api/notes", json={"id": "n1", "projectId": "p1"}, headers=A("keyAAAA")) if False else None
check("A sees own project", [p["id"] for p in c.get("/api/projects", headers=A("keyAAAA")).json()] == ["p1"])
check("ownerId not leaked", "ownerId" not in c.get("/api/projects", headers=A("keyAAAA")).json()[0])
check("B sees no projects", c.get("/api/projects", headers=A("keyBBBB")).json() == [])
check("B cannot read A doc", c.get("/api/documents/d1", headers=A("keyBBBB")).status_code == 404)
check("A can read own doc", c.get("/api/documents/d1", headers=A("keyAAAA")).status_code == 200)
check("B cannot read A artifact", c.get("/api/artifacts/p1/d1/chat", headers=A("keyBBBB")).json() is None)
check("B project docs empty", c.get("/api/projects/p1/documents", headers=A("keyBBBB")).json() == [])
c.delete("/api/projects/p1", headers=A("keyBBBB"))
check("B delete does not affect A", len(c.get("/api/projects", headers=A("keyAAAA")).json()) == 1)
c.post("/api/projects", json={**proj("p1"), "name": "hijack"}, headers=A("keyBBBB"))
check("B same-id write doesn't overwrite A", c.get("/api/projects", headers=A("keyAAAA")).json()[0]["name"] == "n")
check("oversize doc -> 413", c.post("/api/documents", json={"id": "d2", "projectId": "p1", "rawText": "x" * (sec.MAX_DOC_CHARS + 1)}, headers=A("keyAAAA")).status_code == 413)
check("oversize body -> 413", c.post("/api/documents", content=b"x", headers={**A("keyAAAA"), "content-length": str(sec.MAX_BODY_BYTES + 1), "content-type": "application/json"}).status_code == 413)

# CORS
r = c.options("/api/projects", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
check("evil origin gets no ACAO", "access-control-allow-origin" not in r.headers)
r = c.options("/api/projects", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
check("dev origin allowed (preflight, no auth needed)", r.headers.get("access-control-allow-origin") == "http://localhost:5173" and r.status_code == 200)

# ---- MCP rate limit + size ----
sec, srv, c = load(APP_ACCESS_KEYS="keyAAAA,keyBBBB")
srv.call_gemini = lambda p: "ans"
sec.LIMITS["ai"] = [(2, 60)]
call = lambda k: c.post("/mcp", headers=A(k), json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "answer_question", "arguments": {"question": "q", "rawText": "hi"}}})
check("ai call 1 ok", call("keyAAAA").status_code == 200)
check("ai call 2 ok", call("keyAAAA").status_code == 200)
r = call("keyAAAA")
check("ai call 3 -> 429 + Retry-After", r.status_code == 429 and int(r.headers["retry-after"]) > 0)
check("other user unaffected by A's limit", call("keyBBBB").status_code == 200)
check("tools/list not AI-limited", c.post("/mcp", headers=A("keyAAAA"), json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).status_code == 200)
sec.LIMITS["ai"] = [(100, 60)]
big = c.post("/mcp", headers=A("keyBBBB"), json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "generate_report", "arguments": {"rawText": "x" * (sec.MAX_DOC_CHARS + 1)}}}).json()
check("oversize doc rejected before Gemini", "error" in big and "limit" in big["error"]["message"])

# general limit
sec, srv, c = load(APP_ACCESS_KEYS="keyAAAA")
sec.LIMITS["general"] = [(3, 60)]
codes = [c.get("/api/projects", headers=A("keyAAAA")).status_code for _ in range(5)]
check("general limit trips after 3", codes == [200, 200, 200, 429, 429])

# tts bucket (tighter limit on narration)
sec, srv, c = load(APP_ACCESS_KEYS="keyAAAA")
sec.LIMITS["tts"] = [(1, 60)]
check("tts 1 reaches handler", c.post("/api/tts", json={"turns": []}, headers=A("keyAAAA")).status_code == 400)
check("tts 2 rate limited", c.post("/api/tts", json={"turns": []}, headers=A("keyAAAA")).status_code == 429)

# brute force lockout
sec, srv, c = load(APP_ACCESS_KEYS="keyAAAA")
codes = [c.get("/api/projects", headers=A(f"guess{i}")).status_code for i in range(12)]
check("failed attempts: 401s then 429", codes[:10] == [401] * 10 and codes[10] == 429)
check("correct key blocked during lockout", c.get("/api/projects", headers=A("keyAAAA")).status_code == 429)

# ---- modes ----
sec, srv, c = load()
check("local no-keys: open", c.get("/api/projects").status_code == 200 and c.get("/").json()["auth"] == "disabled")
c.post("/api/projects", json=proj("x"))
check("local no-keys: no ownerId stored", "ownerId" not in srv.db["projects"].docs[0])
sec, srv, c = load(VERCEL="1")
check("vercel w/o keys fails closed (503)", c.get("/api/projects").status_code == 503 and c.post("/mcp", json={}).status_code == 503)
check("vercel w/o keys: root still reports status", c.get("/").json()["auth"] == "misconfigured")

print("\nFAILURES:", ok)
sys.exit(1 if ok else 0)
