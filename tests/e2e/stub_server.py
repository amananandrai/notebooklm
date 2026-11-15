"""API server for end-to-end tests: the real app with an in-memory MongoDB and a
deterministic fake LLM (no API keys needed). Usage: python tests/e2e/stub_server.py [port]"""
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
os.environ.setdefault("GEMINI_API_KEY", "stub")
os.environ.setdefault("TTS_BACKEND", "espeak")
# Auth is off unless E2E_ACCESS_KEY is set (then that key is required).
if os.getenv("E2E_ACCESS_KEY"):
    os.environ["APP_ACCESS_KEYS"] = os.environ["E2E_ACCESS_KEY"]
else:
    os.environ.pop("APP_ACCESS_KEYS", None)

import mongomock_motor  # noqa: E402
import uvicorn  # noqa: E402

from app import db, images, llm  # noqa: E402
from app.main import app  # noqa: E402

DELAY = float(os.getenv("FAKE_LLM_DELAY", "0"))
CALLS = []


def fake_complete(prompt, json_mode=False, expect="object", models=None):
    CALLS.append(len(prompt))
    if DELAY:
        time.sleep(DELAY)
    p = prompt
    if "Condense this section" in p:
        return "condensed notes " * 20
    if "mind map" in p:
        return json.dumps({"id": "root-node", "label": "Doc", "category": "Core", "description": "d",
                           "children": [{"id": "sec-1", "label": "Solar", "category": "c", "description": "x",
                                         "children": [{"id": "s1-1", "label": "Budget", "category": "c", "description": "7.3M"}]}]})
    if "Audio Overview" in p:
        return json.dumps([{"speaker": "Host A (Alex)", "text": "Welcome to the show.", "timestamp": "00:04"},
                           {"speaker": "Host B (Jordan)", "text": "Thanks Alex.", "timestamp": "00:28"}])
    if "imagePrompt" in p:
        return json.dumps([{"id": i, "title": f"Visual {i}", "subtitle": "s", "type": "content", "bullets": ["b"],
                            "speakerNotes": "n", "imagePrompt": "x"} for i in range(1, 4)])
    if "slide deck" in p:
        return json.dumps([{"id": i, "title": f"Slide {i}", "subtitle": "s", "type": "content", "bullets": ["b1", "b2"],
                            "speakerNotes": "n"} for i in range(1, 6)])
    if "infographic" in p:
        return json.dumps({"title": "Solar", "subtitle": "S", "accentColor": "#6366f1", "accentColor2": "#8b5cf6", "heroPrompt": "x",
                           "stats": [{"label": "Budget", "value": "7.3M", "icon": "📈", "desc": "d"}],
                           "sections": [{"title": "s", "summary": "s", "icon": "🔹", "color": "#6366f1"}],
                           "timeline": [{"step": 1, "label": "l", "desc": "d"}], "keyInsight": "k"})
    if "study guide" in p:
        return json.dumps({"flashcards": [{"id": "fc-1", "question": "Q", "answer": "A", "category": "c", "mastered": False}],
                           "quiz": [{"id": "q-1", "question": "Q", "options": ["a", "b", "c", "d"], "correctIndex": 0, "explanation": "e"}]})
    if "document assistant" in p:
        pages = re.findall(r"\[Page (\d+)\]", p)
        return f"The zeppelin budget was **7.3 million euros** <img src=x onerror=\"window.__xss=1\"> [Page {pages[-1] if pages else 1}]"
    if "executive report" in p:
        return json.dumps({"reportTitle": "Solar Report", "reportType": "Detailed", "executiveSummary": "E", "keyFindings": ["k"],
                           "sections": [{"title": "t", "content": "c"}], "strategicRecommendations": ["r"],
                           "riskAnalysis": [{"risk": "r", "severity": "Low", "mitigation": "m"}], "conclusion": "c"})
    if "tabular" in p:
        return json.dumps({"tableTitle": "Metrics", "description": "d", "columns": ["A", "B"], "rows": [{"A": "1", "B": "2"}], "summary": "s"})
    if "cross-document" in p:
        return json.dumps({"synthesisTitle": "Renewables", "documentCount": 2, "documentsAnalyzed": ["report.pdf", "wind.pdf"],
                           "commonThemes": [{"theme": "Renewables", "evidence": "Solar and wind"}],
                           "contradictions": [{"topic": "Storage", "docA": "needed", "docB": "not discussed"}],
                           "uniqueInsights": [{"document": "wind.pdf", "insight": "Offshore"}],
                           "overallSynthesis": "Both cover renewables.", "recommendations": ["Invest"]})
    return "{}"


llm.complete = fake_complete
images.image_for_prompt = lambda *a, **k: "data:image/gif;base64,R0lGODlhAQABAAAAACw="
db.set_db(mongomock_motor.AsyncMongoMockClient()["e2e"])


@app.get("/api/__calls")
def _calls():
    return {"calls": len(CALLS)}


if __name__ == "__main__":
    from app import security
    security.PUBLIC_PATHS.add("/api/__calls")
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8080, log_level="warning")
