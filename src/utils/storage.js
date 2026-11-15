import { API_BASE, apiFetch } from './api';

// Fallback key-value storage in case MongoDB is down or loading fails
const memStore = {
  projects: [],
  documents: {},
  artifacts: {}
};

// Tracks when the backend is unreachable so the UI can warn that data is only
// held in memory and will be lost on refresh.
let usingFallback = false;
const fallbackListeners = new Set();

function markFallback(op, err) {
  if (err?.status === 401 || err?.status === 429) {
    console.warn(`Backend ${op} rejected (${err.status}):`, err.message);
    return; // auth prompt / rate-limit message handle these; the server is reachable
  }
  console.warn(`Backend ${op} failed, using in-memory fallback:`, err);
  if (!usingFallback) {
    usingFallback = true;
    fallbackListeners.forEach(fn => fn(true));
  }
}

export function isUsingFallback() { return usingFallback; }

export function onFallbackChange(fn) {
  fallbackListeners.add(fn);
  return () => fallbackListeners.delete(fn);
}

// ── Projects ──
export async function loadProjects() {
  try {
    const res = await apiFetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('API server error');
    const data = await res.json();
    memStore.projects = data;
    return data;
  } catch (err) {
    markFallback('loadProjects', err);
    return memStore.projects;
  }
}

export async function createProject({ name, description, color, color2, icon }) {
  const project = {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: description || '',
    color,
    color2,
    icon,
    sourceIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const res = await apiFetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('createProject', err);
    memStore.projects.unshift(project);
  }
  return project;
}

export async function deleteProject(projectId) {
  try {
    const res = await apiFetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('deleteProject', err);
    memStore.projects = memStore.projects.filter(p => p.id !== projectId);
  }
}

// ── Documents ──
export async function saveDocument(projectId, doc) {
  const payload = { ...doc, projectId };
  try {
    const res = await apiFetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('saveDocument', err);
    memStore.documents[doc.id] = payload;
    const proj = memStore.projects.find(p => p.id === projectId);
    if (proj && !proj.sourceIds.includes(doc.id)) {
      proj.sourceIds.push(doc.id);
      proj.updatedAt = new Date().toISOString();
    }
  }
}

export async function getDocument(docId) {
  try {
    const res = await apiFetch(`${API_BASE}/documents/${docId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    markFallback('getDocument', err);
    return memStore.documents[docId] || null;
  }
}

export async function loadDocumentsForProject(projectId, sourceIds = []) {
  try {
    const res = await apiFetch(`${API_BASE}/projects/${projectId}/documents`);
    if (!res.ok) throw new Error('API error');
    const docs = await res.json();
    if (docs && docs.length > 0) return docs;
  } catch (err) {
    markFallback('loadDocumentsForProject', err);
  }

  // Fallback: fetch individual document objects if sourceIds are available
  if (sourceIds && sourceIds.length > 0) {
    const docs = await Promise.all(sourceIds.map(id => getDocument(id)));
    return docs.filter(Boolean);
  }

  return Object.values(memStore.documents).filter(d => d.projectId === projectId);
}


export async function deleteDocument(projectId, docId) {
  try {
    const res = await apiFetch(`${API_BASE}/documents/${projectId}/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('deleteDocument', err);
    delete memStore.documents[docId];
    const proj = memStore.projects.find(p => p.id === projectId);
    if (proj) proj.sourceIds = proj.sourceIds.filter(id => id !== docId);
  }
}

// ── Artifacts ──
export async function saveArtifact(projectId, docId, featureType, data) {
  const key = `${projectId}_${docId}_${featureType}`;
  const payload = { key, projectId, docId, featureType, data };
  try {
    const res = await apiFetch(`${API_BASE}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('saveArtifact', err);
    memStore.artifacts[key] = data;
  }
}

export async function getArtifact(projectId, docId, featureType) {
  const key = `${projectId}_${docId}_${featureType}`;
  try {
    const res = await apiFetch(`${API_BASE}/artifacts/${projectId}/${docId}/${featureType}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    markFallback('getArtifact', err);
    return memStore.artifacts[key] || null;
  }
}

export async function deleteArtifactsForDoc(projectId, docId) {
  // MongoDB backend deletes artifacts cascade-style when document or project is deleted.
  // Fallback cleanup:
  const features = ['mindmap', 'audio', 'slides', 'slides_img', 'infographic', 'studyguide', 'chat', 'report', 'datatable', 'synthesis'];
  features.forEach(f => {
    delete memStore.artifacts[`${projectId}_${docId}_${f}`];
  });
}

// ── Notes ──
export async function createNote(projectId, note) {
  const payload = { ...note, projectId };
  try {
    const res = await apiFetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('createNote', err);
    if (!memStore.notes) memStore.notes = [];
    memStore.notes.unshift(payload);
  }
}

export async function loadNotes(projectId) {
  try {
    const res = await apiFetch(`${API_BASE}/notes/${projectId}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    markFallback('loadNotes', err);
    return (memStore.notes || []).filter(n => n.projectId === projectId);
  }
}

export async function deleteNote(noteId) {
  try {
    const res = await apiFetch(`${API_BASE}/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    markFallback('deleteNote', err);
    if (memStore.notes) {
      memStore.notes = memStore.notes.filter(n => n.id !== noteId);
    }
  }
}
