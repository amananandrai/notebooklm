/**
 * Fetch wrapper for the NotebookLM Studio API.
 *  - sends the saved access key as `Authorization: Bearer <key>`, only to this app's API origin
 *  - 401: clears the rejected key and asks the UI to prompt for a new one
 *  - 429: throws a readable "try again in Ns" error carrying `retryAfter`
 *  - network failure / 503: tells the UI the server is unreachable (offline banner);
 *    any successful response clears it again
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** API origin: VITE_API_ORIGIN, else the local dev server when running on localhost, else same-origin. */
export const API_ORIGIN: string =
  env.VITE_API_ORIGIN ??
  (LOCAL_HOSTS.has(window.location.hostname) && window.location.port !== '8080' ? 'http://127.0.0.1:8080' : '');
export const API_BASE = `${API_ORIGIN}/api`;

const KEY_STORAGE = 'notebooklm_access_key';
export const AUTH_REQUIRED_EVENT = 'notebooklm:auth-required';
export const CONNECTIVITY_EVENT = 'notebooklm:connectivity';

export function getAccessKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export function setAccessKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch { /* storage unavailable */ }
}

export function clearAccessKey(): void {
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  code?: string;

  constructor(message: string, status: number, retryAfter?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

/** True when `url` points at this app's own API server (the only place the key is sent). */
export function isTrustedApiUrl(url: string): boolean {
  try {
    const target = new URL(url, window.location.href).origin;
    const api = new URL(API_ORIGIN || window.location.origin, window.location.href).origin;
    const local = api.replace('://127.0.0.1', '://localhost');
    return target === api || target === local || target === window.location.origin;
  } catch {
    return false;
  }
}

let online = true;
function setOnline(next: boolean): void {
  if (next === online) return;
  online = next;
  window.dispatchEvent(new CustomEvent(CONNECTIVITY_EVENT, { detail: { online } }));
}
export function isOnline(): boolean { return online; }

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch { /* not JSON */ }
  return res.statusText || `HTTP ${res.status}`;
}

/** Low-level fetch with auth and status handling; returns the Response for any non-error status. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  const key = isTrustedApiUrl(url) ? getAccessKey() : '';
  if (key) headers.set('Authorization', `Bearer ${key}`);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') setOnline(false);
    throw new ApiError("Can't reach the server.", 0);
  }

  if (res.status === 401 && isTrustedApiUrl(url)) {
    const hadKey = Boolean(key);
    clearAccessKey();
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { rejected: hadKey } }));
    throw new ApiError('Access key required.', 401);
  }
  if (res.status === 503) {
    setOnline(false);
    throw new ApiError(await errorDetail(res), 503);
  }
  setOnline(true);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(await errorDetail(res), 429, retryAfter, 'rate_limited');
  }
  if (!res.ok) throw new ApiError(await errorDetail(res), res.status);
  return res;
}

/** JSON request helper. */
export async function apiJson<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = options;
  const init: RequestInit = { ...rest };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = { 'Content-Type': 'application/json', ...(rest.headers || {}) };
  }
  const res = await apiFetch(path, init);
  return (await res.json()) as T;
}
