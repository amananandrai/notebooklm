import uvicorn
import base64
import html
import io
import json
import re
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import wave
from typing import Any, List, Optional, Union
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-flash-latest"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# Nano Banana 2 = gemini-3.1-flash-image (confirmed displayName)
NANO_BANANA_MODEL = "gemini-3.1-flash-image"
NANO_BANANA_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{NANO_BANANA_MODEL}:generateContent?key={GEMINI_API_KEY}"

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
    title: str = "Untitled Document"
    pages: int = 1
    words: int = 0
    rawText: str = ""
    uploadedAt: Optional[str] = None
    createdAt: Optional[str] = None

class ArtifactSchema(BaseModel):
    key: str
    projectId: str
    docId: str
    featureType: str
    data: Union[dict, list, Any]

class NoteSchema(BaseModel):
    id: str
    projectId: str
    docId: Optional[str] = None
    title: str
    content: str
    tags: List[str] = []
    createdAt: str
    updatedAt: str

class TTSRequest(BaseModel):
    turns: List[dict]

class VideoRenderRequest(BaseModel):
    composition: str = "podcast"
    timeline: dict
    showCaptions: bool = True

class HyperFramesRenderRequest(BaseModel):
    template: str = "document-summary"
    timeline: dict
    showCaptions: bool = True

VIDEO_RENDER_JOBS = {}
HYPERFRAMES_JOBS = {}


def _synthesize_video_audio(turns: List[dict]) -> dict:
    """Create one WAV track with the same host voices used by the video recorder.

    Browser SpeechSynthesis is audible but does not expose its output as a
    MediaStream. Windows SAPI gives the recorder a real PCM audio track without
    requiring screen/tab sharing or a microphone.
    """
    if not turns:
        raise ValueError("At least one dialogue turn is required")

    powershell = """
param([string]$TextBase64, [string]$VoiceName, [string]$OutputPath)
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($VoiceName) } catch { }
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutputPath)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
"""

    temp_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tmp_tts")
    os.makedirs(temp_root, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="notebooklm_tts_", dir=temp_root, ignore_cleanup_errors=True) as temp_dir:
        script_path = os.path.join(temp_dir, "synthesize_turn.ps1")
        with open(script_path, "w", encoding="utf-8") as script_file:
            script_file.write(powershell)

        chunk_paths = []
        for index, turn in enumerate(turns):
            text = str(turn.get("text", "")).strip()
            if not text:
                continue
            is_host_a = "host a" in str(turn.get("speaker", "")).lower() or "alex" in str(turn.get("speaker", "")).lower()
            voice_name = "Microsoft David Desktop" if is_host_a else "Microsoft Zira Desktop"
            chunk_path = os.path.join(temp_dir, f"turn_{index}.wav")
            text_b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script_path,
                 "-TextBase64", text_b64, "-VoiceName", voice_name, "-OutputPath", chunk_path],
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
            if result.returncode != 0 or not os.path.exists(chunk_path):
                detail = (result.stderr or result.stdout or "Windows speech synthesis failed").strip()
                raise RuntimeError(detail)
            chunk_paths.append(chunk_path)

        if not chunk_paths:
            raise ValueError("Dialogue turns contain no text")

        combined = bytearray()
        durations = []
        first_params = None
        pause_seconds = 0.5
        for index, chunk_path in enumerate(chunk_paths):
            with wave.open(chunk_path, "rb") as source:
                params = source.getparams()
                if first_params is None:
                    first_params = params
                frames = source.readframes(source.getnframes())
                duration = source.getnframes() / source.getframerate()
                combined.extend(frames)
                if index < len(chunk_paths) - 1:
                    silence_frames = int(source.getframerate() * pause_seconds)
                    combined.extend(b"\x00" * silence_frames * source.getnchannels() * source.getsampwidth())
                    duration += pause_seconds
                durations.append(duration)

        output = io.BytesIO()
        with wave.open(output, "wb") as target:
            target.setnchannels(first_params.nchannels)
            target.setsampwidth(first_params.sampwidth)
            target.setframerate(first_params.framerate)
            target.setcomptype(first_params.comptype, first_params.compname)
            target.writeframes(bytes(combined))

        return {
            "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
            "durations": durations,
        }


@app.post("/api/tts")
async def synthesize_tts(request: TTSRequest):
    try:
        return _synthesize_video_audio(request.turns)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Windows PowerShell is required for video narration")
    except Exception as exc:
        print(f"[TTS Error] {exc}")
        raise HTTPException(status_code=500, detail=f"Video narration failed: {exc}")


def _start_video_render(composition_id: str, props: dict, job_id: str, output_path: str):
    """Start a local Remotion render. The process is polled through the job endpoint."""
    project_root = os.path.dirname(os.path.abspath(__file__))
    props_path = os.path.join(project_root, ".tmp_tts", f"{job_id}.json")
    os.makedirs(os.path.dirname(props_path), exist_ok=True)
    with open(props_path, "w", encoding="utf-8") as props_file:
        json.dump(props, props_file)
    command = [
        "npx", "remotion", "render", "remotion/index.jsx", composition_id,
        output_path, f"--props={props_path}", "--log=progress",
    ]
    process = subprocess.Popen(command, cwd=project_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    VIDEO_RENDER_JOBS[job_id] = {"process": process, "output": output_path, "props": props_path, "status": "rendering", "logs": []}


@app.post("/api/videos/render")
async def render_video(request: VideoRenderRequest):
    composition_map = {
        "podcast": "PodcastStudioComposition",
        "summary": "DocumentSummaryComposition",
        "social": "SocialShortComposition",
    }
    composition_id = composition_map.get(request.composition)
    if not composition_id:
        raise HTTPException(status_code=400, detail="Unsupported Remotion composition")
    job_id = f"video_{int(__import__('time').time() * 1000)}"
    render_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "renders")
    os.makedirs(render_dir, exist_ok=True)
    output_path = os.path.join(render_dir, f"{job_id}.mp4")
    try:
        _start_video_render(composition_id, {"timeline": request.timeline, "showCaptions": request.showCaptions}, job_id, output_path)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Node.js and Remotion are required for MP4 rendering")
    return {"jobId": job_id, "status": "rendering", "message": "Remotion MP4 render started"}


@app.get("/api/videos/render/{job_id}")
async def get_video_render_status(job_id: str):
    job = VIDEO_RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    process = job["process"]
    if process.poll() is None:
        return {"jobId": job_id, "status": "rendering"}
    job["status"] = "complete" if process.returncode == 0 and os.path.exists(job["output"]) else "error"
    if job["status"] == "complete":
        return {"jobId": job_id, "status": "complete", "downloadUrl": f"/api/videos/{job_id}/download"}
    return {"jobId": job_id, "status": "error", "message": "Remotion failed to render the composition"}


@app.get("/api/videos/{video_id}/download")
async def download_video(video_id: str):
    job = VIDEO_RENDER_JOBS.get(video_id)
    if not job or not os.path.exists(job["output"]):
        raise HTTPException(status_code=404, detail="Rendered video is not ready")
    return FileResponse(job["output"], media_type="video/mp4", filename="notebooklm_video.mp4")


@app.post("/api/hyperframes/render")
async def render_hyperframes(request: HyperFramesRenderRequest):
    """Generate a HyperFrames HTML project and render it locally when the CLI is available."""
    hyperframes_cmd = shutil.which("hyperframes") or shutil.which("hyperframes.cmd")
    if not hyperframes_cmd:
        raise HTTPException(status_code=503, detail="HyperFrames CLI is not installed. Run: npm install -g hyperframes")

    timeline = request.timeline or {}
    width = int(timeline.get("width", 1920))
    height = int(timeline.get("height", 1080))
    fps = int(timeline.get("fps", 30))
    duration_seconds = max(1, int(timeline.get("durationInFrames", fps * 10)) / fps)
    resolution = "portrait" if height > width else "square" if width == height else "landscape"
    job_id = f"hyperframes_{int(time.time() * 1000)}"
    project_root = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.join(project_root, ".tmp_hyperframes", job_id)
    output_dir = os.path.join(project_root, "renders")
    output_path = os.path.join(output_dir, f"{job_id}.mp4")
    os.makedirs(project_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    slides_html = []
    for slide in timeline.get("slides", []):
        start = float(slide.get("startFrame", 0)) / fps
        duration = max(0.1, (float(slide.get("endFrame", timeline.get("durationInFrames", fps))) - float(slide.get("startFrame", 0))) / fps)
        bullets = "".join(f"<li>{html.escape(str(bullet))}</li>" for bullet in (slide.get("bullets") or [])[:6])
        slides_html.append(f'<section class="slide clip" data-start="{start:.3f}" data-duration="{duration:.3f}"><h1>{html.escape(str(slide.get("title", "")))}</h1><ul>{bullets}</ul></section>')

    captions_html = []
    if request.showCaptions:
        for turn in timeline.get("turns", []):
            start = float(turn.get("startFrame", 0)) / fps
            duration = max(0.1, float(turn.get("durationInFrames", fps)) / fps)
            captions_html.append(f'<div class="caption clip" data-start="{start:.3f}" data-duration="{duration:.3f}"><b>{html.escape(str(turn.get("speaker", "Host")).upper())}</b><span>{html.escape(str(turn.get("text", "")))}</span></div>')

    index_html = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width={width}, height={height}"><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>
      *{{box-sizing:border-box}} html,body{{margin:0;width:{width}px;height:{height}px;overflow:hidden;background:#090b14;color:#fff;font-family:Inter,Arial,sans-serif}} #root{{position:relative;width:100%;height:100%;background:linear-gradient(135deg,#111b38,#5b3b94)}} .slide{{position:absolute;inset:8%;padding:7%;background:rgba(8,10,20,.38);border:2px solid #c4b5fd88;border-radius:28px}} h1{{font-size:{max(42, width // 24)}px;line-height:1.05;margin:0 0 38px}} li{{font-size:{max(22, width // 62)}px;line-height:1.5;margin:14px 0}} .caption{{position:absolute;left:8%;right:8%;bottom:7%;padding:22px 30px;background:rgba(8,10,18,.94);border:2px solid #c4b5fd99;border-radius:20px;font-size:{max(20, width // 70)}px}} .caption b{{display:block;color:#c4b5fd;font-size:.65em;letter-spacing:1px;margin-bottom:8px}} .clip{{visibility:hidden;opacity:0}} </style></head><body><main id="root" data-composition-id="main" data-start="0" data-duration="{duration_seconds:.3f}" data-width="{width}" data-height="{height}">{''.join(slides_html)}{''.join(captions_html)}</main><script>
      window.__timelines=window.__timelines||{{}}; const tl=gsap.timeline({{paused:true}}); document.querySelectorAll('.clip').forEach((el)=>{{const start=Number(el.dataset.start||0), duration=Number(el.dataset.duration||1); tl.set(el,{{visibility:'visible'}},start).to(el,{{opacity:1,duration:.12}},start).to(el,{{opacity:0,duration:.12}},start+duration-.12);}}); window.__timelines.main=tl;
    </script></body></html>'''
    with open(os.path.join(project_dir, "index.html"), "w", encoding="utf-8") as file:
        file.write(index_html)

    hyperframes_json = {"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json", "paths": {"assets": "assets"}, "media": {"autoProxy": True}}
    with open(os.path.join(project_dir, "hyperframes.json"), "w", encoding="utf-8") as file:
        json.dump(hyperframes_json, file)

    ffmpeg_dir = os.path.join(project_root, "node_modules", "ffmpeg-static")
    ffprobe_dir = os.path.join(project_root, "node_modules", "ffprobe-static", "bin", "win32", "x64")
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join([ffmpeg_dir, ffprobe_dir, env.get("PATH", "")])
    command = [hyperframes_cmd, "render", project_dir, "--output", output_path, "--format", "mp4", "--fps", str(fps), "--resolution", resolution, "--low-memory-mode"]
    try:
        process = subprocess.Popen(command, cwd=project_root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"Unable to start HyperFrames renderer: {exc}")
    HYPERFRAMES_JOBS[job_id] = {"process": process, "output": output_path, "project": project_dir, "status": "rendering"}
    return {"jobId": job_id, "status": "rendering", "message": "HyperFrames render started"}


@app.get("/api/hyperframes/render/{job_id}")
async def get_hyperframes_render_status(job_id: str):
    job = HYPERFRAMES_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="HyperFrames render job not found")
    process = job["process"]
    if process.poll() is None:
        return {"jobId": job_id, "status": "rendering"}
    if process.returncode == 0 and os.path.exists(job["output"]):
        return {"jobId": job_id, "status": "complete", "downloadUrl": f"/api/hyperframes/{job_id}/download"}
    return {"jobId": job_id, "status": "error", "message": "HyperFrames failed to render the composition. Run hyperframes doctor for diagnostics."}


@app.get("/api/hyperframes/{job_id}/download")
async def download_hyperframes_video(job_id: str):
    job = HYPERFRAMES_JOBS.get(job_id)
    if not job or not os.path.exists(job["output"]):
        raise HTTPException(status_code=404, detail="HyperFrames video is not ready")
    return FileResponse(job["output"], media_type="video/mp4", filename="notebooklm_hyperframes.mp4")


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

@app.get("/api/projects/{project_id}/documents")
async def get_project_documents(project_id: str):
    if db is None:
        return []
    cursor = db["documents"].find({"projectId": project_id}, {"_id": 0})
    return await cursor.to_list(length=100)


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


# ── Notes ──
@app.post("/api/notes")
async def create_note(note: NoteSchema):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["notes"].update_one({"id": note.id}, {"$set": note.dict()}, upsert=True)
    return {"status": "success"}

@app.get("/api/notes/{project_id}")
async def get_notes(project_id: str):
    if db is None:
        return []
    cursor = db["notes"].find({"projectId": project_id}, {"_id": 0}).sort("createdAt", -1)
    return await cursor.to_list(length=200)

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available")
    await db["notes"].delete_one({"id": note_id})
    return {"status": "success"}


GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"]

def call_gemini(prompt: str) -> str:
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192}
    }).encode()
    
    last_err = None
    for model_name in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
                resp = urllib.request.urlopen(req, timeout=90)
                data = json.loads(resp.read().decode())
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as e:
                last_err = e
                print(f"[Gemini API] {model_name} returned HTTP {e.code} on attempt {attempt + 1}")
                if e.code in (503, 429, 500):
                    time.sleep(1)
                    continue
                break
            except Exception as e:
                last_err = e
                print(f"[Gemini API] {model_name} failed: {e}")
                time.sleep(1)
                break
                
    raise last_err or RuntimeError("All Gemini model endpoints failed.")


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
                {"name": "generate_slides_with_images", "description": "Generate a slide deck with AI-generated images per slide using Gemini Imagen."},
                {"name": "generate_infographic", "description": "Generate a structured infographic JSON from document text."},
                {"name": "generate_study_guide", "description": "Generate flashcards and quiz questions from document text."},
                {"name": "answer_question", "description": "Answer a user question grounded in the document."},
                {"name": "generate_report", "description": "Generate an executive report with key findings and recommendations."},
                {"name": "generate_data_table", "description": "Extract structured tabular data from document text."},
                {"name": "generate_project_synthesis", "description": "Cross-document synthesis analysis across multiple sources."},
            ]}
        }

    elif method == "tools/call":
        params = body.get("params", {})
        tool = params.get("name")
        args = params.get("arguments", {})
        print(f"[DEBUG MCP Call] tool={tool} arguments={list(args.keys()) if args else None}")
        title = args.get("documentTitle", "Document")
        text = args.get("rawText", "")[:12000]  # cap tokens
        clean_title = re.sub(r"\.pdf$", "", title, flags=re.IGNORECASE)

        try:
            slide_count = int(args.get("slideCount") or args.get("slide_count") or 7)
            theme = str(args.get("theme") or "light_slate")
            audio_length = str(args.get("audioLength") or args.get("lengthMode") or "standard")
            audio_tone = str(args.get("audioTone") or args.get("tone") or "casual")

            if tool == "generate_mindmap":
                result = gen_mindmap(clean_title, text)
            elif tool == "generate_audio_overview":
                result = gen_audio(clean_title, text, length_mode=audio_length, tone=audio_tone)
            elif tool == "generate_slide_deck":
                result = gen_slides(clean_title, text, slide_count=slide_count, theme=theme)
            elif tool == "generate_slides_with_images":
                result = gen_slides_with_images(clean_title, text, slide_count=slide_count, theme=theme)
            elif tool == "generate_infographic":
                result = gen_infographic(clean_title, text)
            elif tool == "generate_study_guide":
                result = gen_study_guide(clean_title, text)
            elif tool == "answer_question":
                result = answer_question(args.get("question", ""), title, text)
            elif tool == "generate_report":
                result = gen_report(clean_title, text)
            elif tool == "generate_data_table":
                result = gen_data_table(clean_title, text)
            elif tool == "generate_project_synthesis":
                texts = args.get("documents", [])
                if not texts:
                    texts = [{"title": title, "text": text}]
                result = gen_project_synthesis(texts)
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


def gen_audio(title: str, text: str, length_mode: str = "standard", tone: str = "casual") -> list:
    turn_counts = {"quick": 6, "standard": 12, "deep": 20}
    num_turns = turn_counts.get(length_mode, 12)

    tone_instructions = {
        "casual": "Lively, natural conversational banter. Alex and Jordan use intuitive everyday analogies, humor, and friendly reactions.",
        "analytical": "Rigorous, technical and analytical discussion. Alex and Jordan cite specific data, methodologies, and architectural details.",
        "debate": "Friendly intellectual debate. Alex and Jordan challenge each other with devil's advocate points, counterarguments, and trade-offs."
    }
    tone_guide = tone_instructions.get(tone, tone_instructions["casual"])

    prompt = f"""You are generating a NotebookLM "Audio Overview" podcast.
Hosts: Alex (Host A) and Jordan (Host B).
Tone & Style: {tone_guide}

Document: {title}
Text: {text}

Generate EXACTLY {num_turns} dialogue turns. Return ONLY a valid JSON array (no markdown fences):
[
  {{"speaker": "Host A (Alex)", "text": "<dialogue grounded in document>", "timestamp": "00:04"}},
  {{"speaker": "Host B (Jordan)", "text": "<dialogue grounded in document>", "timestamp": "00:28"}},
  ...
]
Reference actual facts, figures, and arguments from the document. Timestamps increment naturally (roughly every 20-25 seconds)."""
    return parse_json(call_gemini(prompt))


def gen_slides(title: str, text: str, slide_count: int = 7, theme: str = "light_slate") -> list:
    count = max(3, min(16, int(slide_count)))
    prompt = f"""You are a professional AI presentation designer. Create a slide deck from this document with EXACTLY {count} slides.
Document: {title}
Text: {text}

Return ONLY a valid JSON array of {count} slides (no markdown fences):
[
  {{
    "id": 1, "title": "<title>", "subtitle": "<subtitle>",
    "type": "title",
    "bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "speakerNotes": "<notes grounded in document>"
  }},
  ...
]
Types: "title" for slide 1, "content" for body slides, "summary" for final slide {count}. All content from actual document."""
    slides = parse_json(call_gemini(prompt))
    return slides[:count]


def call_pollinations(image_prompt: str, width: int = 1280, height: int = 720, seed: int = 42, model: str = "flux") -> str:
    """Generate an image via Pollinations.ai (free, no API key) and return a URL.
    Pollinations.ai is an open-source free image generation service."""
    import urllib.parse
    encoded = urllib.parse.quote(image_prompt[:400])
    url = f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&seed={seed}&nologo=true&model={model}"
    try:
        req = urllib.request.Request(url, method='HEAD')
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass
    return url


def gen_slides_with_images(title: str, text: str, slide_count: int = 7, theme: str = "light_slate") -> list:
    """Generate slides with AI image prompts via Gemini, then build Pollinations.ai image URLs matching the chosen theme."""
    count = max(3, min(16, int(slide_count)))
    theme_modifiers = {
        "light_slate": "clean corporate photography, soft bright studio lighting, ultra sharp, 8k",
        "dark_obsidian": "dark atmospheric cyberpunk, glowing cyan volumetric lighting, octane 3d render, 8k",
        "corporate_navy": "sleek architectural boardroom, modern minimalism, deep blue tones, crisp lighting",
        "sunset_warmth": "warm golden hour sunlight, architectural editorial photography, warm amber tones, 8k",
        "emerald_minimalist": "biophilic organic design, minimalist clean studio, soft diffuse emerald lighting, 8k",
    }
    modifier = theme_modifiers.get(theme, theme_modifiers["light_slate"])

    prompt = f"""You are a professional AI presentation designer. Create a visual slide deck from this document with EXACTLY {count} slides.

Document: {title}
Text: {text}

Return ONLY a valid JSON array of {count} slides (no markdown fences):
[
  {{
    "id": 1, "title": "<title>", "subtitle": "<subtitle>",
    "type": "title",
    "bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "speakerNotes": "<notes grounded in document>",
    "imagePrompt": "<vivid 10-15 word visual scene description, no text, cinematic lighting>"
  }},
  ...
]
Types: "title" for slide 1, "content" for body slides, "summary" for final slide {count}.
All content must be grounded in actual document content. imagePrompt must be a vivid visual scene."""

    slides = parse_json(call_gemini(prompt))
    slides = slides[:count]

    # Build Pollinations URL for each slide
    for i, slide in enumerate(slides):
        img_prompt = slide.get("imagePrompt", f"{title} concept, visual illustration")
        full_prompt = f"{img_prompt}, {modifier}"
        slide["imageUrl"] = call_pollinations(full_prompt, width=1280, height=720, seed=i * 17 + 7, model="flux-realism")
        slide["imageData"] = slide["imageUrl"]
        slide["theme"] = theme

    return slides


def gen_infographic(title: str, text: str) -> dict:
    """Generate a structured, interactive infographic with AI hero image illustration."""
    prompt = f"""You are an expert data visualization and infographic designer. Analyze this document and create a richly structured infographic layout.

Document: {title}
Text: {text}

Return ONLY valid JSON (no markdown fences):
{{
  "title": "<concise document title, max 8 words>",
  "subtitle": "<one powerful sentence summarizing the document>",
  "accentColor": "<a vivid hex color that fits the topic, e.g. #6366f1>",
  "accentColor2": "<a second complementary hex color, e.g. #8b5cf6>",
  "heroPrompt": "<vivid 10-15 word image prompt for an abstract visual header graphic representing the core topic, e.g. futuristic neural network banner, dark background>",
  "stats": [
    {{"label": "<metric name>", "value": "<number or short value>", "icon": "<single relevant emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}}
  ],
  "sections": [
    {{"title": "<section name>", "summary": "<2-sentence summary from doc>", "icon": "<emoji>", "color": "#6366f1"}},
    {{"title": "<section name>", "summary": "<2-sentence summary>", "icon": "<emoji>", "color": "#8b5cf6"}},
    {{"title": "<section name>", "summary": "<2-sentence summary>", "icon": "<emoji>", "color": "#ec4899"}}
  ],
  "timeline": [
    {{"step": 1, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 2, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 3, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 4, "label": "<phase or step name>", "desc": "<one sentence>"}}
  ],
  "keyInsight": "<one powerful takeaway quote or key insight from the document, 15-25 words>"
}}

All fields must be grounded in actual document content. No placeholders."""

    data = parse_json(call_gemini(prompt))

    # Generate an AI hero illustration image for the infographic banner using Pollinations
    hero_prompt = data.get("heroPrompt", f"{title} technology visualization, 3d abstract render, neon accent, dark navy background")
    full_prompt = f"{hero_prompt}, 3d render, isometric, 8k, dark moody atmosphere, glowing neon"
    data["heroImage"] = call_pollinations(full_prompt, width=1200, height=450, seed=123, model="flux-3d")

    return data


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


def gen_report(title: str, text: str) -> dict:
    prompt = f"""Create a comprehensive executive report from this document. Return ONLY valid JSON (no markdown fences):
{{
  "reportTitle": "<concise title, max 10 words>",
  "reportType": "Detailed",
  "executiveSummary": "<3-4 sentence executive summary of the document>",
  "keyFindings": [
    "<finding 1 — a specific, data-grounded insight>",
    "<finding 2>",
    "<finding 3>",
    "<finding 4>",
    "<finding 5>"
  ],
  "sections": [
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis for this section>"}},
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis>"}},
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis>"}}
  ],
  "strategicRecommendations": [
    "<actionable recommendation 1>",
    "<actionable recommendation 2>",
    "<actionable recommendation 3>"
  ],
  "riskAnalysis": [
    {{"risk": "<risk name>", "severity": "High|Medium|Low", "mitigation": "<mitigation strategy>"}},
    {{"risk": "<risk name>", "severity": "High|Medium|Low", "mitigation": "<mitigation strategy>"}}
  ],
  "conclusion": "<2-3 sentence conclusion with key takeaway>"
}}

Document: {title}
Text: {text}

All content must be grounded in the actual document. No placeholders."""
    return parse_json(call_gemini(prompt))


def gen_data_table(title: str, text: str) -> dict:
    prompt = f"""Extract structured tabular data from this document. Identify key metrics, comparisons, specifications, or any data that can be organized in a table format. Return ONLY valid JSON (no markdown fences):
{{
  "tableTitle": "<descriptive table title>",
  "description": "<one sentence describing what this table captures>",
  "columns": ["<Column 1 Name>", "<Column 2 Name>", "<Column 3 Name>", "<Column 4 Name>"],
  "rows": [
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}}
  ],
  "summary": "<2 sentence summary of the key patterns or insights from this data>"
}}

Document: {title}
Text: {text}

Extract real data from the document. Create 4-6 meaningful columns and 5-8 rows minimum. All values must be grounded in actual document content."""
    return parse_json(call_gemini(prompt))


def gen_project_synthesis(texts: list) -> dict:
    combined = "\n\n---DOCUMENT SEPARATOR---\n\n".join([f"[{t['title']}]:\n{t['text']}" for t in texts])
    prompt = f"""You are analyzing multiple documents together. Create a cross-document synthesis report. Return ONLY valid JSON (no markdown fences):
{{
  "synthesisTitle": "<title for the cross-document analysis>",
  "documentCount": {len(texts)},
  "documentsAnalyzed": [{', '.join(['"' + t['title'] + '"' for t in texts])}],
  "commonThemes": [
    {{"theme": "<shared theme across documents>", "evidence": "<specific examples from multiple docs>"}},
    {{"theme": "<shared theme>", "evidence": "<examples>"}},
    {{"theme": "<shared theme>", "evidence": "<examples>"}}
  ],
  "contradictions": [
    {{"topic": "<where documents disagree>", "docA": "<position from doc A>", "docB": "<position from doc B>"}}
  ],
  "uniqueInsights": [
    {{"document": "<doc name>", "insight": "<unique insight only found in this document>"}},
    {{"document": "<doc name>", "insight": "<unique insight>"}}
  ],
  "overallSynthesis": "<3-4 sentence unified summary combining insights from all documents>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}}

Documents:
{combined[:15000]}

All analysis must be grounded in actual document content. Identify real overlaps and differences."""
    return parse_json(call_gemini(prompt))


if __name__ == "__main__":
    print(f"NotebookLM MCP Server v3 — {GEMINI_MODEL}")
    print(f"Endpoint: http://127.0.0.1:8080/mcp")
    uvicorn.run(app, host="127.0.0.1", port=8080)
