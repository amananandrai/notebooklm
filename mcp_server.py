"""Local entry point. The application lives in the ``app`` package (see app/main.py).

Run the API locally with:  python mcp_server.py   (http://127.0.0.1:8080)
"""
import uvicorn

from app.main import app  # noqa: F401  (re-exported for api/index.py and tests)

if __name__ == "__main__":
    print("NotebookLM Studio API on http://127.0.0.1:8080  (status: /api/health)")
    uvicorn.run(app, host="127.0.0.1", port=8080)
