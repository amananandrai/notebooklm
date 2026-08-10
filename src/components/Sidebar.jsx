import React, { useState } from 'react';
import { 
  FileText, 
  Upload, 
  Layers, 
  CheckCircle2, 
  Eye, 
  Search, 
  BookOpen, 
  Sparkles,
  RefreshCw,
  Plus
} from 'lucide-react';

export default function Sidebar({ 
  docs, 
  activeDoc, 
  onSelectDoc, 
  onFileUpload, 
  onClearAllData,
  isParsing, 
  parseProgress 
}) {
  const [activeSubTab, setActiveSubTab] = useState('sources'); // 'sources' | 'text'
  const [textSearch, setTextSearch] = useState('');

  const filteredText = activeDoc?.rawText || '';

  return (
    <aside className="glass-panel" style={{ 
      width: '340px', 
      minWidth: '340px', 
      borderRadius: 0, 
      borderTop: 0, 
      borderBottom: 0, 
      borderLeft: 0, 
      display: 'flex', 
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-sidebar)'
    }}>
      {/* Sidebar Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers style={{ width: '18px', height: '18px', color: 'var(--accent-indigo)' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            Sources & Context
          </h2>
        </div>
        
        {docs.length > 0 && (
          <button
            onClick={onClearAllData}
            title="Clear all stored PDFs"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Sub tabs: Sources vs Extracted Text */}
      <div style={{ display: 'flex', padding: '10px 16px 0', gap: '6px' }}>
        <button
          onClick={() => setActiveSubTab('sources')}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '0.82rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: activeSubTab === 'sources' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
            color: activeSubTab === 'sources' ? '#818cf8' : 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          📁 Sources ({docs.length})
        </button>
        <button
          onClick={() => setActiveSubTab('text')}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '0.82rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: activeSubTab === 'text' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
            color: activeSubTab === 'text' ? '#818cf8' : 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          📖 Raw Text Inspector
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {activeSubTab === 'sources' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Upload Zone */}
            <div 
              style={{
                border: '2px dashed rgba(99, 102, 241, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: '20px 16px',
                textAlign: 'center',
                background: 'rgba(99, 102, 241, 0.04)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  onFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/pdf';
                input.onchange = (e) => {
                  if (e.target.files && e.target.files[0]) {
                    onFileUpload(e.target.files[0]);
                  }
                };
                input.click();
              }}
            >
              <Upload style={{ width: '28px', height: '28px', color: 'var(--accent-indigo)', marginBottom: '8px' }} />
              <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                Drag & Drop PDF or Click to Upload
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Supports standard text & scanned image PDFs (In-browser WASM OCR)
              </p>
            </div>

            {/* Parsing Progress Bar */}
            {isParsing && (
              <div className="glass-panel" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>{parseProgress.status}</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{parseProgress.progress}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${parseProgress.progress}%`, background: 'var(--gradient-primary)', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}

            {/* List of Documents */}
            <div style={{ marginTop: '10px' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Loaded Sources
              </p>
              {docs.map((doc) => {
                const isActive = activeDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDoc(doc)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isActive ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.05)'}`,
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText style={{ width: '16px', height: '16px', color: isActive ? 'var(--accent-indigo)' : 'var(--text-muted)' }} />
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: isActive ? '#fff' : 'var(--text-main)', wordBreak: 'break-word' }}>
                          {doc.title}
                        </h4>
                      </div>
                      {isActive && <CheckCircle2 style={{ width: '16px', height: '16px', color: 'var(--accent-emerald)' }} />}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                      <span>📄 {doc.pages || 1} pages</span>
                      <span>•</span>
                      <span>📝 {doc.words || 0} words</span>
                      {doc.isScanned && (
                        <>
                          <span>•</span>
                          <span style={{ color: 'var(--accent-amber)' }}>OCR</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Raw Text Inspector */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '10px', position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '10px', top: '10px', width: '14px', height: '14px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search raw PDF text..."
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
                className="glass-input"
                style={{ width: '100%', paddingLeft: '32px', fontSize: '0.8rem' }}
              />
            </div>
            <pre style={{
              flex: 1,
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              overflowY: 'auto',
              maxHeight: '520px'
            }}>
              {filteredText}
            </pre>
          </div>
        )}
      </div>

      {/* Active Document Overview Footer */}
      {activeDoc && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-color)', background: 'rgba(15, 21, 36, 0.9)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px' }}>CURRENT ACTIVE SOURCE</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', truncate: true }}>
            {activeDoc.title}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Extracted: {activeDoc.uploadedAt}
          </div>
        </div>
      )}
    </aside>
  );
}
