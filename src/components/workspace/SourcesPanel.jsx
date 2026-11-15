import { useRef, useState } from 'react';
import { useDeleteDocument, useUploadDocument } from '../../hooks/queries';
import { cleanTitle } from './tabs';

/** Source list with PDF upload (parsed in the browser) and delete. */
export default function SourcesPanel({ projectId, documents, activeDocId, onSelect, onUploaded }) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ocrState, setOcrState] = useState(null); // { fileName, progress, status }
  const upload = useUploadDocument(projectId);
  const remove = useDeleteDocument(projectId);

  async function handleFiles(files) {
    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    for (const file of pdfFiles) {
      setOcrState({ fileName: file.name, progress: 0, status: 'Reading PDF pages...' });
      try {
        const meta = await upload.mutateAsync({
          file,
          onProgress: ({ progress, status }) => setOcrState({ fileName: file.name, progress, status }),
        });
        onUploaded?.(meta.id);
      } catch (err) {
        alert(`Error parsing ${file.name}: ${err.message}`);
      } finally {
        setOcrState(null);
      }
    }
  }

  async function handleDelete(docId) {
    if (!window.confirm('Delete this source and all its generated artifacts?')) return;
    try {
      await remove.mutateAsync(docId);
    } catch (err) {
      alert(`Could not delete the source: ${err.message}`);
    }
  }

  return (
    <>
      <div className="ws-sources-list">
        {documents.length === 0 && !ocrState && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--border-med)', borderRadius: 'var(--radius-md)', margin: '8px 0' }}>
            No PDFs yet — upload one below
          </div>
        )}
        {documents.map(src => (
          <div
            key={src.id}
            className={`ws-source-item${activeDocId === src.id ? ' active' : ''}`}
            onClick={() => onSelect(src.id)}
          >
            <div className="ws-source-icon">📄</div>
            <div className="ws-source-info">
              <div className="ws-source-name">{cleanTitle(src)}</div>
              <div className="ws-source-meta">{src.pages}p · {(src.words || 0).toLocaleString()} words</div>
            </div>
            <button className="ws-source-del" aria-label={`Delete ${cleanTitle(src)}`} onClick={e => { e.stopPropagation(); handleDelete(src.id); }}>✕</button>
          </div>
        ))}
      </div>

      {ocrState && (
        <div className="ocr-progress">
          <div className="ocr-progress-header">
            <div className="ocr-spinner" />
            <div>
              <div className="ocr-label">Reading PDF...</div>
              <div className="ocr-file">{ocrState.fileName}</div>
            </div>
          </div>
          <div className="ocr-bar-track">
            <div className="ocr-bar-fill" style={{ width: `${ocrState.progress}%` }} />
          </div>
          <div className="ocr-status">{ocrState.status}</div>
        </div>
      )}

      <div className="ws-upload-area">
        <div
          className={`ws-upload-zone${isDragOver ? ' dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ''; } }}
            style={{ display: 'none' }}
          />
          <div className="ws-upload-zone-icon">⬆</div>
          <div className="ws-upload-zone-text">Upload PDF</div>
          <div className="ws-upload-zone-hint">Click or drag &amp; drop file</div>
        </div>
      </div>
    </>
  );
}
