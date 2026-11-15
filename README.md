# NotebookLM Studio

Upload PDFs into a project and turn them into mind maps, podcast-style audio
overviews, slide decks (with or without AI images), infographics, reports, data
tables, study guides, cross-document syntheses, and a 3D video studio — plus a
chat assistant that answers from the document with page citations.

- **Frontend:** React 19 + Vite (`src/`). PDFs are parsed in the browser with
  PDF.js; pages with no text layer fall back to Tesseract OCR.
- **Backend:** FastAPI (`mcp_server.py`) exposing a JSON-RPC `/mcp` endpoint for
  the AI tools (Gemini) and a REST `/api` for storage (MongoDB), narration and
  video rendering. `api/index.py` wraps it for Vercel.

## Quick start

Requirements: Node 20+, Python 3.10+, a Gemini API key. MongoDB is optional —
without it the app keeps data in memory (a banner warns that it is lost on refresh).

```bash
cp .env.example .env   # then set GEMINI_API_KEY (and MONGO_URI if you have MongoDB)
npm install
pip install -r requirements.txt
python mcp_server.py   # API on http://127.0.0.1:8080
npm run dev            # app on http://localhost:5173
```

`GET http://127.0.0.1:8080/` reports whether Gemini, MongoDB, auth and a speech
engine are configured.

## Long documents

Documents up to 60,000 characters go to the model unchanged. Longer ones are
condensed chunk by chunk (map-reduce) so later pages are still covered. Chat
picks the most relevant pages by keyword and cites them as `[Page N]`.

## Video features

| Feature | Needs |
|---|---|
| 3D Video Studio narration (`/api/tts`) | A speech engine: Windows SAPI, Gemini TTS (`GEMINI_API_KEY`), or `espeak-ng`. Choose with `TTS_BACKEND`. |
| MP4 export (Remotion) | Node.js on the server; runs `npx remotion render`. |
| HyperFrames export | `npm install -g hyperframes`. |

Rendering runs local processes, so it does not work on Vercel's serverless
functions; run the backend on a regular server for video export. On failure the
last lines of the render log are shown in the UI (full logs in `renders/`).
Outputs older than `RENDER_RETENTION_HOURS` are deleted automatically.

## Deploying to Vercel

`vercel.json` serves the built app and routes `/api/*` and `/mcp` to
`api/index.py`. Set these in the Vercel project's environment variables:
`GEMINI_API_KEY`, `APP_ACCESS_KEYS` (required — the API refuses all requests
without it), and `MONGO_URI` (e.g. MongoDB Atlas; without it nothing persists).
Long documents can exceed the default function timeout; raise `maxDuration` if needed.

## API security

The API (`/api/*` and `/mcp`) requires an access key when `APP_ACCESS_KEYS` is set.

- Clients send `Authorization: Bearer <key>`; the web app prompts for the key on first use and stores it in `localStorage`.
- Every key has its own private data (projects, documents, artifacts, notes, render jobs).
- Requests are rate limited per key (per IP when auth is off); AI generation, TTS and video rendering have tighter limits. Repeated wrong keys lock an IP out for 5 minutes. All limits are configurable — see `.env.example`.
- With no keys configured the API is open **only when running locally**; on Vercel it refuses all requests until keys are set.
- Rate-limit counters are in memory, per server process. On serverless hosts each instance counts separately, so add a shared limiter (e.g. Upstash/Redis) in front for a hard global cap.
- **Existing data:** documents saved before auth was enabled have no owner and become invisible once keys are set. Assign them to a key's owner id (first 16 hex chars of `sha256(key)`), e.g. in the Mongo shell:
  `db.projects.updateMany({ownerId: {$exists: false}}, {$set: {ownerId: "<owner id>"}})` — repeat for `documents`, `artifacts` and `notes`.

See **Tests** below.

## Tests

```bash
pip install -r requirements.txt -r requirements-dev.txt
python tests/test_security.py      # auth, data isolation, rate limits
python tests/test_concurrency.py   # slow AI calls don't block other requests
python tests/test_server_config.py # body-size limit, missing Gemini key, TTS selection
npm run lint && npm run build
```
