import React, { useState } from 'react';
import { X, Download, FileText, Code, Check } from 'lucide-react';

export default function ExportModal({ activeDoc, artifacts, onClose }) {
  const [exportFormat, setExportFormat] = useState('markdown'); // 'markdown' | 'json'
  const [copied, setCopied] = useState(false);

  const generateMarkdown = () => {
    if (!activeDoc || !artifacts) return '';
    return `# NotebookLM Studio Artifact Export
Document: ${activeDoc.title}
Pages: ${activeDoc.pages || 1} | Words: ${activeDoc.words || 0}
Export Date: ${new Date().toLocaleString()}

---

## 🧠 Mind Map Hierarchical Structure
${JSON.stringify(artifacts.mindmap, null, 2)}

---

## 🎙️ Audio Podcast Overview Script
${artifacts.audioScript?.map(t => `**${t.speaker}** (${t.timestamp}):\n${t.text}`).join('\n\n')}

---

## 📊 Executive Presentation Slides
${artifacts.slides?.map(s => `### Slide ${s.id}: ${s.title}\n*Subtitle:* ${s.subtitle || 'N/A'}\n\n*Bullets:*\n${s.bullets?.map(b => `- ${b}`).join('\n')}\n\n*Speaker Notes:* ${s.speakerNotes}`).join('\n\n')}

---

## 🎴 Flashcards & Study Questions
${artifacts.flashcards?.map((f, i) => `Q${i+1}: ${f.question}\nA: ${f.answer}\n`).join('\n')}
`;
  };

  const handleDownload = () => {
    const content = exportFormat === 'json' ? JSON.stringify(artifacts, null, 2) : generateMarkdown();
    const extension = exportFormat === 'json' ? 'json' : 'md';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDoc?.title || 'NotebookLM'}_Artifacts.${extension}`;
    link.click();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', padding: '28px', background: 'rgba(18, 24, 38, 0.98)', border: '1px solid var(--border-highlight)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Download style={{ width: '22px', height: '22px', color: 'var(--accent-indigo)' }} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
              Export NotebookLM Artifacts
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Select your preferred export format to save generated Mind Maps, Audio scripts, Slide decks, and Study notes for <strong style={{ color: '#fff' }}>{activeDoc?.title}</strong>.
        </p>

        {/* Format Options */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <button
            onClick={() => setExportFormat('markdown')}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${exportFormat === 'markdown' ? 'var(--accent-indigo)' : 'var(--border-color)'}`,
              background: exportFormat === 'markdown' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600
            }}
          >
            <FileText style={{ width: '18px', height: '18px', color: 'var(--accent-indigo)' }} /> Markdown (.md)
          </button>

          <button
            onClick={() => setExportFormat('json')}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${exportFormat === 'json' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
              background: exportFormat === 'json' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.03)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600
            }}
          >
            <Code style={{ width: '18px', height: '18px', color: 'var(--accent-cyan)' }} /> JSON Structure (.json)
          </button>
        </div>

        {/* Preview Container */}
        <pre style={{
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          background: 'rgba(0, 0, 0, 0.4)',
          padding: '14px',
          borderRadius: 'var(--radius-sm)',
          maxHeight: '220px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          marginBottom: '24px'
        }}>
          {exportFormat === 'json' ? JSON.stringify(artifacts, null, 2) : generateMarkdown()}
        </pre>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleDownload} className="btn-primary">
            <Download style={{ width: '16px', height: '16px' }} /> Download {exportFormat.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
