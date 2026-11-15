"""A slow AI call must not block other API requests, and long jobs stream heartbeats."""
import asyncio
import json
import time

import httpx

from helpers import check, done, make_client
from app import llm

GEMINI_DELAY = 1.5


def slow_complete(*args, **kwargs):
    time.sleep(GEMINI_DELAY)  # blocking, like the real HTTP call
    return '{"reportTitle": "R"}'


async def main():
    from app.main import create_app

    client, db = make_client(JOB_HEARTBEAT_S="0.5")
    client.post("/api/projects", json={"id": "p", "name": "n", "color": "c", "color2": "c", "icon": "i", "createdAt": "x", "updatedAt": "x"})
    client.post("/api/documents", json={"id": "d", "projectId": "p", "rawText": "hello"})
    llm.complete = slow_complete
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30) as http:
        t0 = time.monotonic()
        gen = asyncio.create_task(http.post("/api/generate", json={"projectId": "p", "docId": "d", "tool": "report"}))
        await asyncio.sleep(0.2)  # let the generation start
        other = await http.get("/api/projects")
        # Measured from the start: if the event loop were blocked, the sleep above
        # could not resume until the AI call finished.
        waited = time.monotonic() - t0
        resp = await gen
    events = [json.loads(line) for line in resp.text.splitlines() if line.strip()]
    check("other request served during generation", other.status_code == 200 and waited < GEMINI_DELAY * 0.6)
    check("stream starts with the job id", events[0].get("type") == "job" and events[0].get("jobId"))
    check("stream sends heartbeats while working", any(e.get("type") == "heartbeat" for e in events))
    check("stream ends with the result", events[-1].get("type") == "result" and events[-1]["data"] == {"reportTitle": "R"})
    print(f"(other request answered after {waited:.2f}s; AI delay {GEMINI_DELAY}s)")


asyncio.run(main())
done()
