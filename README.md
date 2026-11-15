# NotebookLM Studio

Upload PDFs into a project and turn them into mind maps, podcast-style audio
overviews, slide decks (with or without AI images), infographics, reports, data
tables, study guides, cross-document syntheses, and a 3D video studio — plus a
chat assistant that answers from the document with page citations.

## Architecture

```
Browser (React 19 + Vite)                     Vercel function (FastAPI, app/)
  routes: /, /p/:project/:doc/:tab   ──REST──▶  routes/storage.py   projects, documents, artifacts, notes
  hooks: TanStack Query (src/hooks)            routes/generate.py  /api/generate (streamed job), /api/chat, /api/jobs
  typed API client (src/api/*.ts)              routes/tts.py       /api/tts
  PDF.js + OCR, exports, three.js studio       llm.py  ──▶ Gemini | OpenAI-compatible | Anthropic
                                               rag.py (condensing, retrieval, citations), generators.py
                                               db.py ──▶ MongoDB (lazy connect, indexes, cache, jobs, rate limits)
                                               images.py ──▶ Pollinations (+ Vercel Blob storage)
```

- **PDFs are parsed in the browser** (PDF.js; pages without a text layer use Tesseract OCR). The text is stored once; AI requests send only ids and the server loads the text.
- **Generation** (`POST /api/generate`) streams NDJSON: a job id, heartbeats every 10 s, then the result. If the connection drops, the client polls `GET /api/jobs/{id}`; the work finishes and is saved regardless. Results are cached by document text + tool options, so asking again costs no AI quota (`Regenerate` bypasses the cache).
- **Rate limits** are shared across serverless instances through MongoDB on Vercel (in memory locally).
- Full review and rationale: [`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md).

## Quick start

Requirements: Node 20+, Python 3.10+, an LLM API key (Gemini by default).

```bash
cp .env.example .env          # set GEMINI_API_KEY; MONGO_URI=memory works without MongoDB
npm install
pip install -r requirements.txt -r requirements-dev.txt
python mcp_server.py          # API on http://127.0.0.1:8080  (status: /api/health)
npm run dev                   # app on http://localhost:5173
```

`GET /api/health` shows the LLM provider and models, auth mode, rate-limit store, Blob storage and speech engine.

## Using a different AI model

Text generation goes through `app/llm.py`. Set:

```bash
LLM_PROVIDER=openai_compat                 # gemini | openai_compat | anthropic
LLM_BASE_URL=https://api.groq.com/openai/v1  # any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Mistral, Together, DeepSeek, Ollama, ...)
LLM_API_KEY=...
LLM_MODELS=model-a,model-b                 # tried in order; check your provider's model list
```

For models with small context windows lower `LLM_MAX_DIRECT_CHARS`, `LLM_CHUNK_CHARS` and `LLM_CHAT_CONTEXT_CHARS`; `LLM_CONDENSE_MODEL` can name a cheaper model for long-document condensing. Narration keeps using Gemini TTS if `GEMINI_API_KEY` is set (or `TTS_BACKEND=espeak`). See `docs/ARCHITECTURE_REVIEW.md` §7.

## Long documents

Documents up to `LLM_MAX_DIRECT_CHARS` (60,000) go to the model unchanged. Longer ones are condensed chunk by chunk (map-reduce) so later pages are still covered. Chat picks the most relevant pages by keyword and cites them as `[Page N]`.

## Images

Slide and infographic images come from Pollinations' free endpoint. With `BLOB_READ_WRITE_TOKEN` set (Vercel Blob), the server downloads each image once and stores it, so images never change and viewers' browsers don't call Pollinations. Without it the image URL is used directly.

## 3D Video Studio

The studio renders the podcast scene in the browser (three.js) and records it with MediaRecorder. Narration comes from `/api/tts`: Windows SAPI on Windows, Gemini TTS when `GEMINI_API_KEY` is set, otherwise `espeak-ng` (`TTS_BACKEND` forces one).

## Deploying to Vercel

`vercel.json` serves the SPA and routes `/api/*` to `api/index.py` (300 s max duration). Set in the Vercel project: `GEMINI_API_KEY` (or the `LLM_*` variables), `APP_ACCESS_KEYS` (required — the API refuses all requests without it) and `MONGO_URI` (e.g. MongoDB Atlas). Optional: `BLOB_READ_WRITE_TOKEN` for stored images.

## API security

The API requires an access key when `APP_ACCESS_KEYS` is set.

- Clients send `Authorization: Bearer <key>`; the web app prompts for the key on first use and stores it in `localStorage`. The key is only ever sent to this app's own API origin.
- Every key has its own private data (projects, documents, artifacts, notes, jobs).
- Rate limits per key (per IP when auth is off): general, AI and TTS buckets; repeated wrong keys lock an IP out for 5 minutes. On Vercel the counters live in MongoDB (`RATE_LIMIT_STORE=auto`), so they hold across instances.
- With no keys configured the API is open **only when running locally**; on Vercel it refuses all requests until keys are set.
- **Existing data:** documents saved before auth was enabled have no owner and become invisible once keys are set. Assign them to a key's owner id (first 16 hex chars of `sha256(key)`), e.g. in the Mongo shell:
  `db.projects.updateMany({ownerId: {$exists: false}}, {$set: {ownerId: "<owner id>"}})` — repeat for `documents`, `artifacts` and `notes`.

## Tests

```bash
pip install -r requirements.txt -r requirements-dev.txt
npm run test:api        # security, concurrency, config, API (in-memory MongoDB, stubbed LLM)
npm run lint && npm run typecheck && npm run build
```

Browser end-to-end (stub API, no keys needed):

```bash
node tests/e2e/make_fixtures.mjs           # once
python tests/e2e/stub_server.py 8080 &     # E2E_ACCESS_KEY=... to also test the key prompt
npm run dev &                              # or: npm run build && npx vite preview --port 5173
node tests/e2e/smoke.cjs
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request.
