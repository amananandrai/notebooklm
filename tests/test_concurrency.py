"""Regression test: a slow Gemini call must not block other API requests."""
import asyncio, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for k in ["APP_ACCESS_KEYS", "VERCEL"]:
    os.environ.pop(k, None)
import httpx
import mcp_server

GEMINI_DELAY = 1.5


def slow_gemini(prompt):
    time.sleep(GEMINI_DELAY)  # blocking, like the real urllib call
    return '{"reportTitle": "R"}'


async def main():
    mcp_server.call_gemini = slow_gemini
    mcp_server.GEMINI_API_KEY = "test-key"  # stubbed: no real calls are made
    mcp_server.db = None
    transport = httpx.ASGITransport(app=mcp_server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "generate_report", "arguments": {"rawText": "hello", "documentTitle": "a.pdf"}}}
        t0 = time.monotonic()
        gen = asyncio.create_task(client.post("/mcp", json=body))
        await asyncio.sleep(0.2)  # let the generation start
        other = await client.get("/api/projects")
        # Measured from the start: if the event loop is blocked, the sleep above
        # cannot resume until the Gemini call finishes.
        waited = time.monotonic() - t0
        result = (await gen).json()

    failures = 0
    for name, cond in [
        ("other request served during generation", other.status_code == 200 and waited < GEMINI_DELAY * 0.6),
        ("generation still returns its result", result.get("result") is not None),
    ]:
        print(("PASS" if cond else "FAIL"), name)
        failures += 0 if cond else 1
    print(f"(other request answered after {waited:.2f}s; Gemini delay {GEMINI_DELAY}s)")
    return failures


async def unknown_tool():
    transport = httpx.ASGITransport(app=mcp_server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "nope"}})
    ok = r.json().get("error", {}).get("code") == -32601
    print(("PASS" if ok else "FAIL"), "unknown tool -> -32601")
    return 0 if ok else 1


if __name__ == "__main__":
    failures = asyncio.run(main()) + asyncio.run(unknown_tool())
    print(f"\nFAILURES: {failures}")
    sys.exit(1 if failures else 0)
