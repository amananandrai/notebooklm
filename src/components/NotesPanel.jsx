import { useState, useEffect } from 'react';
import { createNote, loadNotes, deleteNote } from '../utils/storage';

export default function NotesPanel({ projectId, docId }) {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotes() {
      if (!projectId) return;
      setLoading(true);
      try {
        const loaded = await loadNotes(projectId);
        setNotes(loaded || []);
      } catch (err) {
        console.error('Failed to load notes', err);
      }
      setLoading(false);
    }
    fetchNotes();
  }, [projectId]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      docId: docId || null,
      title: title.trim() || 'Untitled Note',
      content: content.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await createNote(projectId, newNote);
      setNotes(prev => [newNote, ...prev]);
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('Failed to add note', err);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      await deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  return (
    <div className="ws-notes-container">
      <form onSubmit={handleAddNote} className="ws-notes-form">
        <input
          type="text"
          placeholder="Note title (optional)..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="ws-notes-input"
        />
        <textarea
          placeholder="Capture an insight, quote, or idea..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="ws-notes-textarea"
          required
        />
        <button
          type="submit"
          className="btn-generate ws-notes-submit"
          disabled={!content.trim()}
        >
          <span>＋</span> Add Note
        </button>
      </form>

      <div className="ws-notes-list">
        {loading ? (
          <div className="ws-notes-empty">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="ws-notes-empty">
            <span style={{ fontSize: 22, display: 'block', marginBottom: 6 }}>📝</span>
            No notes yet. Capture key insights above!
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="ws-note-card">
              <button
                onClick={() => handleDelete(note.id)}
                className="ws-note-del"
                title="Delete note"
              >
                ✕
              </button>
              {note.title && <div className="ws-note-title">{note.title}</div>}
              <div className="ws-note-content">{note.content}</div>
              <div className="ws-note-date">
                {new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
