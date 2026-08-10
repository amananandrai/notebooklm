import uvicorn
import json
import re
import os
import urllib.request
from typing import Any, List, Optional, Union
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-flash-latest"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB", "notebooklm_studio")

app = FastAPI(title="NotebookLM MCP Server (Gemini & MongoDB Powered)", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

db_client = None
db = None

@app.on_event("startup")
async def startup_db_client():
    global db_client, db
    try:
        db_client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=1000)
        db = db_client[MONGO_DB_NAME]
        # Quick ping to verify connectivity
        await db_client.admin.command('ping')
        print(f"Connected to MongoDB successfully: {MONGO_DB_NAME}")
    except Exception as e:
        print(f"WARNING: MongoDB connection failed (falling back to memory/local fallback): {e}")
        db = None

@app.on_event("shutdown")
async def shutdown_db_client():
    if db_client:
        db_client.close()
        print("MongoDB connection closed.")


# ── MongoDB Schemas ───────────────────────────────────────────
class ProjectSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    color: str
    color2: str
    icon: str
    sourceIds: List[str] = []
    createdAt: str
    updatedAt: str

class DocumentSchema(BaseModel):
    id: str
    projectId: str
    title: str
    pages: int
    words: int
    rawText: str
    uploadedAt: str

class ArtifactSchema(BaseModel):
    key: str
    projectId: str
    docId: str
    featureType: str
    data: Union[dict, list, Any]


# ── REST API Endpoints for MongoDB Storage ───────────────────────

@app.get("/api/projects")
async def get_projects():
    if db is None:
        return []
    cursor = db["projects"].find({}, {"_id": 0})
    return await cursor.to_list(length=100)

@app.post("/api/projects")
async def create_project(project: ProjectSchema):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["projects"].update_one({"id": project.id}, {"$set": project.dict()}, upsert=True)
    return {"status": "success"}

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["projects"].delete_one({"id": project_id})
    await db["documents"].delete_many({"projectId": project_id})
    await db["artifacts"].delete_many({"projectId": project_id})
    return {"status": "success"}

@app.post("/api/documents")
async def save_document(doc: DocumentSchema):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["documents"].update_one({"id": doc.id}, {"$set": doc.dict()}, upsert=True)
    await db["projects"].update_one(
        {"id": doc.projectId},
        {"$addToSet": {"sourceIds": doc.id}, "$set": {"updatedAt": doc.uploadedAt}}
    )
    return {"status": "success"}

@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    doc = await db["documents"].find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@app.delete("/api/documents/{project_id}/{doc_id}")
async def delete_document(project_id: str, doc_id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["documents"].delete_one({"id": doc_id})
    await db["artifacts"].delete_many({"docId": doc_id})
    await db["projects"].update_one(
        {"id": project_id},
        {"$pull": {"sourceIds": doc_id}}
    )
    return {"status": "success"}

@app.post("/api/artifacts")
async def save_artifact(art: ArtifactSchema):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["artifacts"].update_one({"key": art.key}, {"$set": art.dict()}, upsert=True)
    return {"status": "success"}

@app.get("/api/artifacts/{project_id}/{doc_id}/{feature_type}")
async def get_artifact(project_id: str, doc_id: str, feature_type: str):
    if db is None:
        return None
    key = f"{project_id}_{doc_id}_{feature_type}"
    art = await db["artifacts"].find_one({"key": key}, {"_id": 0})
    return art["data"] if art else None


def call_gemini(prompt: str) -> str:
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192}
    }).encode()
    req = urllib.request.Request(GEMINI_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    resp = urllib.request.urlopen(req, timeout=60)
    data = json.loads(resp.read().decode())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def parse_json(text: str):
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    # Find first [ or { and last ] or }
    start = min((cleaned.find("{"), cleaned.find("[") if "[" in cleaned else len(cleaned)), key=lambda x: x if x >= 0 else len(cleaned))
    if "{" in cleaned and (cleaned.find("{") <= cleaned.find("[") if "[" in cleaned else True):
        end = cleaned.rfind("}") + 1
    else:
        end = cleaned.rfind("]") + 1
    return json.loads(cleaned[start:end])


@app.get("/")
def root():
    return {"status": "online", "service": "NotebookLM MCP Server", "model": GEMINI_MODEL, "endpoint": "/mcp", "mongodb": "enabled" if db is not None else "disabled"}


@app.post("/mcp")
async def handle_mcp(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}, "id": None}

    method = body.get("method")
    rpc_id = body.get("id", 1)

    if method == "tools/list":
        return {
            "jsonrpc": "2.0", "id": rpc_id,
            "result": {"tools": [
                {"name": "generate_mindmap", "description": "Generate an interactive mind map from document text."},
                {"name": "generate_audio_overview", "description": "Generate a two-host podcast script from document text."},
                {"name": "generate_slide_deck", "description": "Generate an executive slide deck from document text."},
                {"name": "generate_study_guide", "description": "Generate flashcards and quiz questions from document text."},
                {"name": "answer_question", "description": "Answer a user question grounded in the document."},
            ]}
        }

    elif method == "tools/call":
        params = body.get("params", {})
        tool = params.get("name")
        args = params.get("arguments", {})
        title = args.get("documentTitle", "Document")
        text = args.get("rawText", "")[:12000]  # cap tokens
        clean_title = re.sub(r"\.pdf$", "", title, flags=re.IGNORECASE)

        try:
            if tool == "generate_mindmap":
                result = gen_mindmap(clean_title, text)
            elif tool == "generate_audio_overview":
                result = gen_audio(clean_title, text)
            elif tool == "generate_slide_deck":
                result = gen_slides(clean_title, text)
            elif tool == "generate_study_guide":
                result = gen_study_guide(clean_title, text)
            elif tool == "answer_question":
                result = answer_question(args.get("question", ""), title, text)
            else:
                return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": f"Unknown tool: {tool}"}}

            return {"jsonrpc": "2.0", "id": rpc_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result)}]}}

        except Exception as e:
            print(f"[MCP Error] tool={tool} error={e}")
            return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32000, "message": str(e)}}

    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": "Method not found"}}


# ── INDIVIDUAL GENERATORS ────────────────────────────────────────────────────

def gen_mindmap(title: str, text: str) -> dict:
    prompt = f"""You are a NotebookLM-style AI. Analyze this document and produce a detailed hierarchical mind map as JSON.

Document: {title}
Text: {text}

Return ONLY valid JSON (no markdown fences):
{{
  "id": "root-node",
  "label": "<document title>",
  "category": "Core Theme",
  "description": "<one sentence summary>",
  "children": [
    {{
      "id": "sec-1", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s1-1", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}},
        {{"id": "s1-2", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}},
        {{"id": "s1-3", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}}
      ]
    }},
    {{
      "id": "sec-2", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s2-1", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s2-2", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s2-3", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}}
      ]
    }},
    {{
      "id": "sec-3", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s3-1", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s3-2", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}}
      ]
    }}
  ]
}}
Every label and description must be grounded in actual document content. No placeholders."""
    return parse_json(call_gemini(prompt))


def gen_audio(title: str, text: str) -> list:
    prompt = f"""You are generating a NotebookLM "Audio Overview" podcast. Two hosts — Alex (Host A) and Jordan (Host B) — have a lively natural conversation. They ask each other questions, react genuinely, use analogies, and unpack ideas in plain language.

Document: {title}
Text: {text}

Generate 8-10 dialogue turns. Return ONLY a valid JSON array (no markdown fences):
[
  {{"speaker": "Host A (Alex)", "text": "<dialogue grounded in document>", "timestamp": "00:04"}},
  {{"speaker": "Host B (Jordan)", "text": "<dialogue grounded in document>", "timestamp": "00:28"}},
  ...
]
Reference actual facts, figures, and arguments from the document. Timestamps increment naturally (roughly every 20-25 seconds)."""
    return parse_json(call_gemini(prompt))


def gen_slides(title: str, text: str) -> list:
    prompt = f"""You are a professional AI presentation designer. Create a slide deck from this document. Each slide must have real content from the document.

Document: {title}
Text: {text}

Return ONLY a valid JSON array of 5 slides (no markdown fences):
[
  {{
    "id": 1, "title": "<title>", "subtitle": "<subtitle>",
    "type": "title",
    "bullets": ["<bullet from doc>", "<bullet from doc>", "<bullet from doc>"],
    "speakerNotes": "<notes grounded in document>"
  }},
  ...
]
Types: "title" for slide 1, "content" for body slides, "summary" for final. All content from actual document."""
    return parse_json(call_gemini(prompt))


def gen_study_guide(title: str, text: str) -> dict:
    prompt = f"""Create a study guide from this document. Return ONLY valid JSON (no markdown fences):
{{
  "flashcards": [
    {{"id": "fc-1", "question": "<question from doc>", "answer": "<answer from doc>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-2", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-3", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-4", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-5", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-6", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}}
  ],
  "quiz": [
    {{
      "id": "q-1", "question": "<question>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctIndex": 0,
      "explanation": "<explanation citing doc>"
    }},
    {{"id": "q-2", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 0, "explanation": "<explanation>"}},
    {{"id": "q-3", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 1, "explanation": "<explanation>"}},
    {{"id": "q-4", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 2, "explanation": "<explanation>"}}
  ]
}}

Document: {title}
Text: {text}

All questions and answers must be grounded in the actual document content."""
    return parse_json(call_gemini(prompt))


def answer_question(question: str, title: str, text: str) -> dict:
    prompt = f"""You are a document assistant. Answer this question strictly based on the document provided. Cite specific sections when possible.

Document: {title}
Text: {text}

Question: {question}

Give a clear, accurate, detailed answer. If not in the document, say so honestly."""
    answer = call_gemini(prompt).strip()
    return {
        "sender": "assistant",
        "text": f"**[Gemini — Document Grounded]**\n\n{answer}",
        "citations": [title, "Gemini Analysis"]
    }


if __name__ == "__main__":
    print(f"NotebookLM MCP Server v3 — {GEMINI_MODEL}")
    print(f"Endpoint: http://127.0.0.1:8080/mcp")
    uvicorn.run(app, host="127.0.0.1", port=8080)
