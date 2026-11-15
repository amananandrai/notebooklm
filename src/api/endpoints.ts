/** One function per API endpoint. */
import { ApiError, apiFetch, apiJson } from './client';
import type {
  ArtifactMap, ChatMessage, DocumentMeta, GenerateEvent, GenerateRequest, Job, NewDocument, Note, Project, TtsResult,
} from './types';

// ── Projects ──
export const listProjects = () => apiJson<Project[]>('/projects');
export const getProject = (id: string) => apiJson<Project>(`/projects/${encodeURIComponent(id)}`);
export const saveProject = (project: Project) => apiJson<{ status: string }>('/projects', { method: 'POST', json: project });
export const deleteProject = (id: string) => apiJson<{ status: string }>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Documents ──
export const listDocuments = (projectId: string) =>
  apiJson<DocumentMeta[]>(`/projects/${encodeURIComponent(projectId)}/documents`);
export const saveDocument = (doc: NewDocument) => apiJson<{ status: string }>('/documents', { method: 'POST', json: doc });
export const deleteDocument = (projectId: string, docId: string) =>
  apiJson<{ status: string }>(`/documents/${encodeURIComponent(projectId)}/${encodeURIComponent(docId)}`, { method: 'DELETE' });

// ── Artifacts ──
export const listArtifacts = (projectId: string, docId: string) =>
  apiJson<ArtifactMap>(`/projects/${encodeURIComponent(projectId)}/artifacts?docId=${encodeURIComponent(docId)}`);
export const saveChatHistory = (projectId: string, docId: string, messages: ChatMessage[]) =>
  apiJson<{ status: string }>('/artifacts', { method: 'POST', json: { projectId, docId, featureType: 'chat', data: messages } });

// ── Notes ──
export const listNotes = (projectId: string) => apiJson<Note[]>(`/notes/${encodeURIComponent(projectId)}`);
export const saveNote = (note: Note) => apiJson<{ status: string }>('/notes', { method: 'POST', json: note });
export const deleteNote = (noteId: string) => apiJson<{ status: string }>(`/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });

// ── AI ──
export const askQuestion = (projectId: string, docId: string, question: string, history: ChatMessage[]) =>
  apiJson<ChatMessage>('/chat', { method: 'POST', json: { projectId, docId, question, history } });

export const synthesizeSpeech = (turns: Array<{ speaker: string; text: string }>) =>
  apiJson<TtsResult>('/tts', { method: 'POST', json: { turns } });

export const getJob = (jobId: string) => apiJson<Job>(`/jobs/${encodeURIComponent(jobId)}`);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function failure(event: Extract<GenerateEvent, { type: 'error' }>): ApiError {
  const status = event.code === 'quota' ? 429 : event.code === 'not_configured' ? 503 : 500;
  return new ApiError(event.message, status, event.retryAfter, event.code);
}

/** Wait for a job to finish by polling (used when the stream is cut off). */
async function pollJob(jobId: string, signal?: AbortSignal): Promise<unknown> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (signal?.aborted) throw new ApiError('Cancelled.', 0);
    const job = await getJob(jobId);
    if (job.status === 'done') return job.result;
    if (job.status === 'error') {
      throw new ApiError(job.error?.message || 'Generation failed.', 500, job.error?.retryAfter, job.error?.code);
    }
    await sleep(Math.min(2000 + attempt * 500, 5000));
  }
  throw new ApiError('Generation is taking too long. Try again later.', 504);
}

/**
 * Run a generation. Reads the NDJSON event stream (job id, heartbeats, result);
 * if the connection drops after the job started, falls back to polling the job.
 */
export async function generate(
  req: GenerateRequest,
  { onEvent, signal }: { onEvent?: (e: GenerateEvent) => void; signal?: AbortSignal } = {},
): Promise<{ data: unknown; cached: boolean }> {
  let jobId: string | null = null;
  try {
    const res = await apiFetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.body) throw new ApiError('Empty response.', 502);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as GenerateEvent;
        onEvent?.(event);
        if (event.type === 'job') jobId = event.jobId;
        if (event.type === 'result') return { data: event.data, cached: event.cached };
        if (event.type === 'error') throw failure(event);
      }
      if (done) break;
    }
    throw new ApiError('Connection closed before the result arrived.', 0);
  } catch (err) {
    const recoverable = err instanceof ApiError ? err.status === 0 || err.status >= 502 && !err.code : err instanceof TypeError;
    if (jobId && recoverable && !signal?.aborted) {
      return { data: await pollJob(jobId, signal), cached: false };
    }
    throw err;
  }
}
