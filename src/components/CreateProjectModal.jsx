import { useState } from 'react';
import { createProject } from '../utils/storage';

const COLORS = [
  { color: '#7c6cf6', color2: '#6c5ce7' },
  { color: '#ec4899', color2: '#f97316' },
  { color: '#3b82f6', color2: '#06b6d4' },
  { color: '#22c55e', color2: '#14b8a6' },
  { color: '#f59e0b', color2: '#ef4444' },
  { color: '#8b5cf6', color2: '#ec4899' },
];

const ICONS = ['📚', '🔬', '💡', '🌍', '📊', '🧠', '⚡', '🎯', '🏗️', '🎓', '🔭', '🧬'];

export default function CreateProjectModal({ onCreated, onClose }) {
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [iconIdx, setIconIdx]   = useState(0);
  const [error, setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Project name is required.'); return; }
    const project = await createProject({
      name: name.trim(),
      description: desc.trim(),
      color: COLORS[colorIdx].color,
      color2: COLORS[colorIdx].color2,
      icon: ICONS[iconIdx],
    });
    onCreated(project);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">✦ Create New Project</div>
        <div className="modal-sub">Give your project a name and a personality</div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="modal-field">
            <label className="modal-label">Project Name *</label>
            <input
              className="modal-input"
              placeholder="e.g. Machine Learning Research"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
          </div>

          {/* Description */}
          <div className="modal-field">
            <label className="modal-label">Description (optional)</label>
            <textarea
              className="modal-input"
              placeholder="What is this project about?"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
            />
          </div>

          {/* Color */}
          <div className="modal-field">
            <label className="modal-label">Color Theme</label>
            <div className="color-picker">
              {COLORS.map((c, i) => (
                <div
                  key={i}
                  className={`color-swatch${colorIdx === i ? ' selected' : ''}`}
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color2})` }}
                  onClick={() => setColorIdx(i)}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="modal-field">
            <label className="modal-label">Icon</label>
            <div className="icon-picker">
              {ICONS.map((icon, i) => (
                <div
                  key={i}
                  className={`icon-chip${iconIdx === i ? ' selected' : ''}`}
                  onClick={() => setIconIdx(i)}
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-med)',
            marginBottom: 8,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 'var(--radius-sm)',
              background: `linear-gradient(135deg, ${COLORS[colorIdx].color}, ${COLORS[colorIdx].color2})`,
              display: 'grid', placeItems: 'center', fontSize: 20,
              boxShadow: `0 4px 12px ${COLORS[colorIdx].color}40`,
            }}>
              {ICONS[iconIdx]}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                {name || 'Project Name'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {desc || 'No description'}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create Project →</button>
          </div>
        </form>
      </div>
    </div>
  );
}
