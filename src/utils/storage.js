const API_BASE = window.location.origin.includes('5173') || window.location.origin.includes('localhost')
  ? 'http://127.0.0.1:8080/api'
  : '/api';

// Fallback key-value storage in case MongoDB is down or loading fails
const memStore = {
  projects: [],
  documents: {},
  artifacts: {}
};

// ── Projects ──
export async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('API server error');
    const data = await res.json();
    memStore.projects = data;
    return data;
  } catch (err) {
    console.warn('MongoDB projects fetch failed, using fallback:', err);
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
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    console.warn('MongoDB createProject failed, using fallback:', err);
    memStore.projects.unshift(project);
  }
  return project;
}

export async function deleteProject(projectId) {
  try {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    console.warn('MongoDB deleteProject failed, using fallback:', err);
    memStore.projects = memStore.projects.filter(p => p.id !== projectId);
  }
}

// ── Documents ──
export async function saveDocument(projectId, doc) {
  const payload = { ...doc, projectId };
  try {
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    console.warn('MongoDB saveDocument failed, using fallback:', err);
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
    const res = await fetch(`${API_BASE}/documents/${docId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    console.warn('MongoDB getDocument failed, using fallback:', err);
    return memStore.documents[docId] || null;
  }
}

export async function loadDocumentsForProject(projectId, sourceIds = []) {
  try {
    const res = await fetch(`${API_BASE}/projects/${projectId}/documents`);
    if (!res.ok) throw new Error('API error');
    const docs = await res.json();
    if (docs && docs.length > 0) return docs;
  } catch (err) {
    console.warn('MongoDB loadDocumentsForProject failed, trying individual fetch:', err);
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
    const res = await fetch(`${API_BASE}/documents/${projectId}/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    console.warn('MongoDB deleteDocument failed, using fallback:', err);
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
    const res = await fetch(`${API_BASE}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('API error');
  } catch (err) {
    console.warn('MongoDB saveArtifact failed, using fallback:', err);
    memStore.artifacts[key] = data;
  }
}

export async function getArtifact(projectId, docId, featureType) {
  const key = `${projectId}_${docId}_${featureType}`;
  try {
    const res = await fetch(`${API_BASE}/artifacts/${projectId}/${docId}/${featureType}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    console.warn('MongoDB getArtifact failed, using fallback:', err);
    return memStore.artifacts[key] || null;
  }
}

export async function deleteArtifactsForDoc(projectId, docId) {
  // MongoDB backend deletes artifacts cascade-style when document or project is deleted.
  // Fallback cleanup:
  const features = ['mindmap', 'audio', 'slides', 'studyguide', 'chat'];
  features.forEach(f => {
    delete memStore.artifacts[`${projectId}_${docId}_${f}`];
  });
}
