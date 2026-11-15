/**
 * Data hooks (TanStack Query). Server state lives in the query cache; components
 * never keep their own copies. Failed writes surface as errors instead of being
 * silently "saved" in memory.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';

export const keys = {
  projects: ['projects'],
  project: id => ['project', id],
  documents: projectId => ['documents', projectId],
  artifacts: (projectId, docId) => ['artifacts', projectId, docId],
  notes: projectId => ['notes', projectId],
};

const newId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Projects ──
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
}

export function useProject(projectId) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.getProject(projectId),
    enabled: Boolean(projectId),
    initialData: () => qc.getQueryData(keys.projects)?.find(p => p.id === projectId),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description, color, color2, icon }) => {
      const now = new Date().toISOString();
      const project = { id: newId('proj'), name, description: description || '', color, color2, icon, sourceIds: [], createdAt: now, updatedAt: now };
      await api.saveProject(project);
      return project;
    },
    onSuccess: project => {
      qc.setQueryData(keys.project(project.id), project);
      qc.setQueryData(keys.projects, (list = []) => [project, ...list]);
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projectId => api.deleteProject(projectId),
    onSuccess: (_r, projectId) => {
      qc.setQueryData(keys.projects, (list = []) => list.filter(p => p.id !== projectId));
      qc.removeQueries({ queryKey: keys.project(projectId) });
    },
  });
}

// ── Documents ──
export function useDocuments(projectId) {
  return useQuery({ queryKey: keys.documents(projectId), queryFn: () => api.listDocuments(projectId), enabled: Boolean(projectId) });
}

/** Parse a PDF in the browser (PDF.js / OCR) and store it. `onProgress({progress, status})`. */
export function useUploadDocument(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, onProgress }) => {
      const { parsePDFFile } = await import('../utils/pdfParser');
      const parsed = await parsePDFFile(file, onProgress);
      const now = new Date().toISOString();
      const doc = {
        id: parsed.id || newId('doc'),
        projectId,
        title: parsed.title || file.name || 'Document.pdf',
        rawText: parsed.rawText || '',
        pages: Number(parsed.pages) || 1,
        words: Number(parsed.words) || 0,
        uploadedAt: now,
        createdAt: now,
      };
      await api.saveDocument(doc);
      const { rawText: _omit, ...meta } = doc;
      return meta;
    },
    onSuccess: meta => {
      qc.setQueryData(keys.documents(projectId), (list = []) => [...list.filter(d => d.id !== meta.id), meta]);
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useDeleteDocument(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: docId => api.deleteDocument(projectId, docId),
    onSuccess: (_r, docId) => {
      qc.setQueryData(keys.documents(projectId), (list = []) => list.filter(d => d.id !== docId));
      qc.removeQueries({ queryKey: keys.artifacts(projectId, docId) });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

// ── Artifacts (one request per document, not one per tab) ──
export function useArtifacts(projectId, docId) {
  return useQuery({
    queryKey: keys.artifacts(projectId, docId),
    queryFn: () => api.listArtifacts(projectId, docId),
    enabled: Boolean(projectId && docId),
    staleTime: 60_000,
  });
}

export function useSaveChat(projectId, docId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: messages => api.saveChatHistory(projectId, docId, messages),
    onMutate: messages => qc.setQueryData(keys.artifacts(projectId, docId), (prev = {}) => ({ ...prev, chat: messages })),
  });
}

// ── Notes ──
export function useNotes(projectId) {
  return useQuery({ queryKey: keys.notes(projectId), queryFn: () => api.listNotes(projectId), enabled: Boolean(projectId) });
}

export function useAddNote(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, content, docId }) => {
      const now = new Date().toISOString();
      const note = { id: newId('note'), projectId, docId: docId || null, title, content, tags: [], createdAt: now, updatedAt: now };
      await api.saveNote(note);
      return note;
    },
    onSuccess: note => qc.setQueryData(keys.notes(projectId), (list = []) => [note, ...list]),
  });
}

export function useDeleteNote(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: noteId => api.deleteNote(noteId),
    onSuccess: (_r, noteId) => qc.setQueryData(keys.notes(projectId), (list = []) => list.filter(n => n.id !== noteId)),
  });
}
