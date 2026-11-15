# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## API security

The API (`/api/*` and `/mcp`) requires an access key when `APP_ACCESS_KEYS` is set.

- Clients send `Authorization: Bearer <key>`; the web app prompts for the key on first use and stores it in `localStorage`.
- Every key has its own private data (projects, documents, artifacts, notes, render jobs).
- Requests are rate limited per key (per IP when auth is off); AI generation, TTS and video rendering have tighter limits. Repeated wrong keys lock an IP out for 5 minutes. All limits are configurable — see `.env.example`.
- With no keys configured the API is open **only when running locally**; on Vercel it refuses all requests until keys are set.
- Rate-limit counters are in memory, per server process. On serverless hosts each instance counts separately, so add a shared limiter (e.g. Upstash/Redis) in front for a hard global cap.
- **Existing data:** documents saved before auth was enabled have no owner and become invisible once keys are set. Assign them to a key's owner id (first 16 hex chars of `sha256(key)`), e.g. in the Mongo shell:
  `db.projects.updateMany({ownerId: {$exists: false}}, {$set: {ownerId: "<owner id>"}})` — repeat for `documents`, `artifacts` and `notes`.

Run the security tests with `pip install -r requirements.txt -r requirements-dev.txt && python tests/test_security.py`.
