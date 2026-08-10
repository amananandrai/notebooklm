import React from 'react';
import { BookOpen, UploadCloud, Download, Sparkles, ShieldCheck, FileText, Cpu } from 'lucide-react';

export default function Header({ 
  activeDoc, 
  allDocs, 
  onSelectDoc, 
  onOpenUploadModal, 
  onOpenExportModal,
  onOpenMCPConfig 
}) {
  return (
    <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
      {/* Left Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'var(--gradient-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 18px rgba(99, 102, 241, 0.4)'
        }}>
          <Sparkles style={{ color: '#fff', width: '22px', height: '22px' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
              NotebookLM <span style={{ color: 'var(--accent-indigo)' }}>Studio</span>
            </h1>
            <button 
              onClick={onOpenMCPConfig}
              className="badge badge-indigo"
              style={{ cursor: 'pointer', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.2)' }}
            >
              <Cpu style={{ width: '12px', height: '12px' }} /> MCP Provider ⚙️
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            PDF Document Intelligence & Dynamic Artifact Suite
          </p>
        </div>
      </div>

      {/* Middle Active Source Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <FileText style={{ width: '18px', height: '18px', color: 'var(--accent-cyan)' }} />
        <select 
          value={activeDoc ? activeDoc.id : ''} 
          onChange={(e) => {
            const found = allDocs.find(d => d.id === e.target.value);
            if (found) onSelectDoc(found);
          }}
          className="glass-input"
          style={{ cursor: 'pointer', maxWidth: '320px', fontWeight: 500, paddingRight: '30px' }}
        >
          {allDocs.map((d) => (
            <option key={d.id} value={d.id} style={{ background: '#111827', color: '#fff' }}>
              📄 {d.title} ({d.pages || 1} pgs)
            </option>
          ))}
        </select>
      </div>

      {/* Right Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <ShieldCheck style={{ width: '14px', height: '14px' }} />
          Local IndexedDB & OCR Active
        </div>

        <button onClick={onOpenUploadModal} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }}>
          <UploadCloud style={{ width: '16px', height: '16px' }} /> Upload PDF
        </button>

        <button onClick={onOpenExportModal} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.88rem' }}>
          <Download style={{ width: '16px', height: '16px' }} /> Export
        </button>
      </div>
    </header>
  );
}
