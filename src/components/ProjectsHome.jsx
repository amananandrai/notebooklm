import { useState, useEffect } from 'react';
import { loadProjects, deleteProject } from '../utils/storage';

const PROJECT_COLORS = [
  { color: '#7c6cf6', color2: '#6c5ce7', label: 'Purple' },
  { color: '#ec4899', color2: '#f97316', label: 'Pink' },
  { color: '#3b82f6', color2: '#06b6d4', label: 'Blue' },
  { color: '#22c55e', color2: '#14b8a6', label: 'Green' },
  { color: '#f59e0b', color2: '#ef4444', label: 'Amber' },
  { color: '#8b5cf6', color2: '#ec4899', label: 'Violet' },
];

const PROJECT_ICONS = ['📚', '🔬', '💡', '🌍', '📊', '🧠', '⚡', '🎯', '🏗️', '🎓', '🔭', '🧬'];

export default function ProjectsHome({ onOpenProject, onCreateProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    async function fetchProjects() {
      const data = await loadProjects();
      setProjects(data || []);
      setLoading(false);
    }
    fetchProjects();
  }, []);

  async function handleDelete(e, projectId) {
    e.stopPropagation();
    if (confirm('Delete this project and all its data?')) {
      await deleteProject(projectId);
      const data = await loadProjects();
      setProjects(data || []);
    }
    setMenuOpen(null);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="ph-root" onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <header className="ph-header">
        <div className="ph-logo">
          <div className="ph-logo-icon">✦</div>
          <div>
            <div className="ph-logo-name">NotebookLM Studio</div>
            <div className="ph-logo-sub">Powered by Gemini</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="ph-body">
        <div className="ph-section-head">
          <div>
            <div className="ph-section-title">Your Projects</div>
            <div className="ph-section-sub">Create a project to upload PDFs and generate AI insights</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', border: '3px solid var(--accent-dim)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 14 }}>Loading projects from database...</div>
          </div>
        ) : (
          <div className="ph-grid">
            {/* Create new card */}
            <button className="ph-create-card" onClick={onCreateProject}>
              <div className="ph-create-icon">+</div>
              <div className="ph-create-label">New Project</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload PDFs & generate insights</div>
            </button>

            {/* Project cards */}
            {projects.map(project => {
              const colorVars = {
                '--card-color': project.color,
                '--card-color2': project.color2,
              };
              return (
                <div
                  key={project.id}
                  className="ph-project-card"
                  style={colorVars}
                  onClick={() => onOpenProject(project)}
                >
                  <div className="ph-project-card-top">
                    <div
                      className="ph-project-icon"
                      style={{ '--card-color': project.color, '--card-color2': project.color2 }}
                    >
                      {project.icon}
                    </div>
                    <button
                      className="ph-project-menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === project.id ? null : project.id); }}
                    >
                      ⋯
                    </button>
                    {menuOpen === project.id && (
                      <div
                        style={{
                          position: 'absolute', top: 52, right: 12, zIndex: 50,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-hi)',
                          borderRadius: 'var(--radius-md)', padding: 6,
                          boxShadow: 'var(--shadow-lg)', minWidth: 140,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => handleDelete(e, project.id)}
                          style={{
                            width: '100%', padding: '8px 12px', background: 'none',
                            border: 'none', color: 'var(--red)', cursor: 'pointer',
                            fontSize: 13, textAlign: 'left', borderRadius: 6,
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => e.target.style.background = '#ef444418'}
                          onMouseLeave={e => e.target.style.background = 'none'}
                        >
                          🗑 Delete Project
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="ph-project-name">{project.name}</div>
                  {project.description && (
                    <div className="ph-project-desc">{project.description}</div>
                  )}

                  <div className="ph-project-meta">
                    <span>{formatDate(project.createdAt)}</span>
                    <span className="ph-project-badge">
                      {(project.sourceIds || []).length} source{(project.sourceIds || []).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
              No projects yet
            </div>
            <div style={{ fontSize: 13 }}>Create your first project to get started</div>
          </div>
        )}
      </main>
    </div>
  );
}

export { PROJECT_COLORS, PROJECT_ICONS };
