/** Shapes exchanged with the NotebookLM Studio API (see app/schemas.py). */

export type ToolId =
  | 'mindmap' | 'audio' | 'slides' | 'slides_img' | 'infographic'
  | 'report' | 'datatable' | 'studyguide' | 'synthesis';

export type TabId = ToolId | 'video' | 'chat';

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  color2: string;
  icon: string;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Document metadata as listed by the API (the full text stays on the server). */
export interface DocumentMeta {
  id: string;
  projectId: string;
  title: string;
  pages: number;
  words: number;
  uploadedAt?: string | null;
  createdAt?: string | null;
}

export interface NewDocument extends DocumentMeta {
  rawText: string;
}

export interface Note {
  id: string;
  projectId: string;
  docId?: string | null;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  page: number;
  snippet: string;
}

export interface ChatMessage {
  id?: string | number;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Array<Citation | string>;
}

/** Artifacts for one document (plus project-level ones), keyed by tool/tab id. */
export type ArtifactMap = Partial<Record<TabId, unknown>>;

export interface GenerateOptions {
  slideCount?: number;
  theme?: string;
  audioLength?: string;
  audioTone?: string;
}

export interface GenerateRequest {
  projectId: string;
  docId?: string | null;
  tool: ToolId;
  options?: GenerateOptions;
  force?: boolean;
}

export type GenerateEvent =
  | { type: 'job'; jobId: string }
  | { type: 'heartbeat'; elapsed: number }
  | { type: 'result'; data: unknown; cached: boolean; jobId?: string }
  | { type: 'error'; code: 'quota' | 'not_configured' | 'bad_request' | 'failed' | 'interrupted'; message: string; retryAfter?: number; jobId?: string };

export interface Job {
  jobId: string;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  cached?: boolean;
  error?: { code: string; message: string; retryAfter?: number };
}

export interface TtsResult {
  audioBase64: string;
  durations: number[];
  engine: string;
}
