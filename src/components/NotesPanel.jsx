import { useState } from 'react';
import { useAddNote, useDeleteNote, useNotes } from '../hooks/queries';

export default function NotesPanel({ projectId, docId }) {
  const notesQuery = useNotes(projectId);
  const notes = notesQuery.data || [];
  const loading = notesQuery.isLoading;
  const addNote = useAddNote(projectId);
  const removeNote = useDeleteNote(projectId);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    try {
      setError('');
      await addNote.mutateAsync({ title: title.trim() || 'Untitled Note', content: content.trim(), docId });
      setTitle('');
      setContent('');
    } catch (err) {
      setError(`Could not save the note: ${err.message}`);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      setError('');
      await removeNote.mutateAsync(noteId);
    } catch (err) {
      setError(`Could not delete the note: ${err.message}`);
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
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, padding: '4px 12px' }}>⚠ {error}</div>}

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
