/**
 * Shared fetch wrapper for the NotebookLM API.
 *  - sends the saved access key as `Authorization: Bearer <key>`, but only to
 *    this app's own API origin (see isTrustedApiUrl)
 *  - on 401 clears the rejected key and asks the UI to prompt for a new one
 *  - on 429 throws a readable "try again in Ns" error
 */

const IS_LOCAL = window.location.origin.includes('5173') || window.location.origin.includes('localhost');
export const API_ORIGIN = IS_LOCAL ? 'http://127.0.0.1:8080' : '';
export const API_BASE = `${API_ORIGIN}/api`;

const KEY_STORAGE = 'notebooklm_access_key';
export const AUTH_REQUIRED_EVENT = 'notebooklm:auth-required';

export function getAccessKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export function setAccessKey(key) {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch { /* storage unavailable */ }
}

export function clearAccessKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function errorDetail(res) {
  try {
    const body = await res.clone().json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch { /* not JSON */ }
  return res.statusText || `HTTP ${res.status}`;
}

/**
 * True when `url` points at this app's own API server. The access key is only
 * ever sent there, never to a custom MCP server URL typed into settings.
 */
export function isTrustedApiUrl(url) {
  try {
    const target = new URL(url, window.location.href).origin;
    const api = new URL(API_ORIGIN || window.location.origin, window.location.href).origin;
    // localhost and 127.0.0.1 are the same local dev server
    const local = api.replace('://127.0.0.1', '://localhost');
    return target === api || target === local || target === window.location.origin;
  } catch {
    return false;
  }
}

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const key = isTrustedApiUrl(url) ? getAccessKey() : '';
  if (key) headers.set('Authorization', `Bearer ${key}`);

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && isTrustedApiUrl(url)) {
    const hadKey = Boolean(key);
    clearAccessKey();
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { rejected: hadKey } }));
    throw new ApiError('Access key required.', 401);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(await errorDetail(res), 429, retryAfter);
  }
  return res;
}

/** Download a file from an authenticated endpoint (anchors can't send headers). */
export async function downloadAuthed(path, filename) {
  const res = await apiFetch(`${API_ORIGIN}${path}`);
  if (!res.ok) throw new ApiError(await errorDetail(res), res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
