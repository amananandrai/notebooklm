"""Auth, per-owner data isolation, CORS, size limits and rate limits (memory and shared Mongo store)."""
import time

import mongomock_motor

from helpers import A, check, database, done, make_client, project, security, settings

# ---- auth enabled ----
c, db = make_client(APP_ACCESS_KEYS="keyAAAA,keyBBBB")
check("health is public", c.get("/api/health").status_code == 200 and c.get("/api/health").json()["auth"] == "enabled")
check("no key -> 401", c.get("/api/projects").status_code == 401)
check("wrong key -> 401", c.get("/api/projects", headers=A("nope")).status_code == 401)
check("valid key -> 200", c.get("/api/projects", headers=A("keyAAAA")).status_code == 200)
check("generate needs auth", c.post("/api/generate", json={"projectId": "p", "docId": "d", "tool": "report"}).status_code == 401)
check("chat needs auth", c.post("/api/chat", json={"projectId": "p", "docId": "d", "question": "q"}).status_code == 401)
check("tts needs auth", c.post("/api/tts", json={"turns": []}).status_code == 401)
check("old /mcp endpoint is gone", c.post("/mcp", json={}, headers=A("keyAAAA")).status_code in (404, 405))

# isolation
c.post("/api/projects", json=project("p1"), headers=A("keyAAAA"))
c.post("/api/documents", json={"id": "d1", "projectId": "p1", "rawText": "hello"}, headers=A("keyAAAA"))
c.post("/api/artifacts", json={"projectId": "p1", "docId": "d1", "featureType": "chat", "data": [1]}, headers=A("keyAAAA"))
check("A sees own project", [p["id"] for p in c.get("/api/projects", headers=A("keyAAAA")).json()] == ["p1"])
check("A can open own project by id", c.get("/api/projects/p1", headers=A("keyAAAA")).status_code == 200)
check("B cannot open A project by id", c.get("/api/projects/p1", headers=A("keyBBBB")).status_code == 404)
check("ownerId not leaked", "ownerId" not in c.get("/api/projects", headers=A("keyAAAA")).json()[0])
check("B sees no projects", c.get("/api/projects", headers=A("keyBBBB")).json() == [])
check("B cannot read A doc", c.get("/api/documents/d1", headers=A("keyBBBB")).status_code == 404)
check("A can read own doc", c.get("/api/documents/d1", headers=A("keyAAAA")).status_code == 200)
check("A sees own artifacts", c.get("/api/projects/p1/artifacts?docId=d1", headers=A("keyAAAA")).json() == {"chat": [1]})
check("B cannot read A artifacts", c.get("/api/projects/p1/artifacts?docId=d1", headers=A("keyBBBB")).json() == {})
check("B project docs empty", c.get("/api/projects/p1/documents", headers=A("keyBBBB")).json() == [])
check("B cannot generate on A doc", c.post("/api/generate", json={"projectId": "p1", "docId": "d1", "tool": "report"},
                                           headers=A("keyBBBB")).status_code == 404)
check("B cannot chat with A doc", c.post("/api/chat", json={"projectId": "p1", "docId": "d1", "question": "q"},
                                         headers=A("keyBBBB")).status_code == 404)
c.delete("/api/projects/p1", headers=A("keyBBBB"))
check("B delete does not affect A", len(c.get("/api/projects", headers=A("keyAAAA")).json()) == 1)
c.post("/api/projects", json={**project("p1"), "name": "hijack"}, headers=A("keyBBBB"))
check("B same-id write doesn't overwrite A", c.get("/api/projects/p1", headers=A("keyAAAA")).json()["name"] == "n")
check("oversize doc -> 413", c.post("/api/documents", json={"id": "d2", "projectId": "p1", "rawText": "x" * (settings.max_document_chars + 1)},
                                    headers=A("keyAAAA")).status_code == 413)
check("oversize body -> 413", c.post("/api/documents", content=b"x", headers={**A("keyAAAA"), "content-length": str(settings.max_request_bytes + 1),
                                                                             "content-type": "application/json"}).status_code == 413)

# CORS
r = c.options("/api/projects", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
check("evil origin gets no ACAO", "access-control-allow-origin" not in r.headers)
r = c.options("/api/projects", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
check("dev origin allowed (preflight, no auth needed)", r.headers.get("access-control-allow-origin") == "http://localhost:5173" and r.status_code == 200)

# ---- AI limit (chat) ----
c, db = make_client(APP_ACCESS_KEYS="keyAAAA,keyBBBB", RATE_LIMIT_AI_PER_MIN="2")
for key in ("keyAAAA", "keyBBBB"):
    c.post("/api/projects", json=project("p" + key), headers=A(key))
    c.post("/api/documents", json={"id": "d" + key, "projectId": "p" + key, "rawText": "hi"}, headers=A(key))
import app.llm as llm_mod  # noqa: E402
llm_mod.complete = lambda *a, **k: "ans"
ask = lambda k: c.post("/api/chat", headers=A(k), json={"projectId": "p" + k, "docId": "d" + k, "question": "q"})  # noqa: E731
check("ai call 1 ok", ask("keyAAAA").status_code == 200)
check("ai call 2 ok", ask("keyAAAA").status_code == 200)
r = ask("keyAAAA")
check("ai call 3 -> 429 + Retry-After", r.status_code == 429 and int(r.headers["retry-after"]) > 0)
check("other user unaffected by A's limit", ask("keyBBBB").status_code == 200)

# general limit
c, db = make_client(APP_ACCESS_KEYS="keyAAAA", RATE_LIMIT_GENERAL_PER_MIN="3")
codes = [c.get("/api/projects", headers=A("keyAAAA")).status_code for _ in range(5)]
check("general limit trips after 3", codes == [200, 200, 200, 429, 429] or (time.time() % 60 > 58))

# tts bucket
c, db = make_client(APP_ACCESS_KEYS="keyAAAA", RATE_LIMIT_TTS_PER_MIN="1")
check("tts 1 reaches handler", c.post("/api/tts", json={"turns": []}, headers=A("keyAAAA")).status_code == 400)
check("tts 2 rate limited", c.post("/api/tts", json={"turns": []}, headers=A("keyAAAA")).status_code == 429)

# brute force lockout
c, db = make_client(APP_ACCESS_KEYS="keyAAAA")
codes = [c.get("/api/projects", headers=A(f"guess{i}")).status_code for i in range(12)]
check("failed attempts: 401s then 429", codes[:10] == [401] * 10 and codes[10] == 429)
check("correct key blocked during lockout", c.get("/api/projects", headers=A("keyAAAA")).status_code == 429)

# ---- shared (Mongo) rate-limit store: limits hold across instances ----
c1, db = make_client(APP_ACCESS_KEYS="keyAAAA", RATE_LIMIT_STORE="mongo", RATE_LIMIT_GENERAL_PER_MIN="4")
from app.main import create_app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
c2 = TestClient(create_app())  # a second "instance" sharing the same database
codes = [cl.get("/api/projects", headers=A("keyAAAA")).status_code for cl in (c1, c2, c1, c2, c1, c2)]
check("shared store: limit enforced across two instances", codes[:4] == [200] * 4 and codes[4:] == [429, 429] or (time.time() % 60 > 58))
security.memory_store.reset()  # instance memory is irrelevant with the shared store
check("shared store survives instance memory reset", c1.get("/api/projects", headers=A("keyAAAA")).status_code == 429 or (time.time() % 60 > 58))
codes = [c2.get("/api/projects", headers=A(f"guess{i}")).status_code for i in range(11)]
check("shared store: lockout applies on the other instance", c1.get("/api/projects", headers=A("keyAAAA")).status_code == 429)
import asyncio  # noqa: E402
rl = asyncio.run(db["rate_limits"].find_one({}))
check("rate-limit docs carry a TTL expiry", rl is not None and "expiresAt" in rl)

# shared store down -> falls back to memory instead of failing requests
c, db = make_client(APP_ACCESS_KEYS="keyAAAA", RATE_LIMIT_STORE="mongo")
database.set_db(None)
database.settings.mongo_uri = "mongodb://127.0.0.1:1"
database.settings.mongo_timeout_ms = 200
r = c.get("/api/health")
check("health works with DB down", r.status_code == 200)
r = c.get("/api/projects", headers=A("keyAAAA"))
check("DB down -> 503 (not empty data)", r.status_code == 503)
database.set_db(mongomock_motor.AsyncMongoMockClient()["x"])

# ---- modes ----
c, db = make_client()
check("local no-keys: open", c.get("/api/projects").status_code == 200 and c.get("/api/health").json()["auth"] == "disabled")
c.post("/api/projects", json=project("x"))
stored = asyncio.run(db["projects"].find_one({"id": "x"}))
check("local no-keys: no ownerId stored", stored is not None and "ownerId" not in stored)
c, db = make_client(VERCEL="1")
check("vercel w/o keys fails closed (503)", c.get("/api/projects").status_code == 503
      and c.post("/api/generate", json={"projectId": "p", "docId": "d", "tool": "report"}).status_code == 503)
check("vercel w/o keys: health still reports status", c.get("/api/health").json()["auth"] == "misconfigured")

done()
