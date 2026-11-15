import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import NotesPanel from '../NotesPanel';
import SourcesPanel from './SourcesPanel';
import StudioPanel from './StudioPanel';
import { DEFAULT_OPTIONS } from './options';
import { TABS, cleanTitle } from './tabs';
import { useArtifacts, useDocuments, useProject } from '../../hooks/queries';
import { useGenerate, slotKey } from '../../hooks/useGenerate';

const TAB_IDS = new Set(TABS.map(t => t.id));

/**
 * Route: /p/:projectId/:docId?/:tab?
 * The URL is the source of truth for the open project, document and tab, so
 * links can be shared, refresh keeps your place and the Back button works.
 */
export default function WorkspacePage() {
  const { projectId, docId, tab: tabParam } = useParams();
  const navigate = useNavigate();
  const projectQuery = useProject(projectId);
  const documentsQuery = useDocuments(projectId);
  const documents = documentsQuery.data || [];
  const activeDoc = documents.find(d => d.id === docId) || null;
  const tab = TAB_IDS.has(tabParam) ? tabParam : 'mindmap';
  const artifactsQuery = useArtifacts(projectId, activeDoc?.id);
  const generation = useGenerate(projectId, documents);
  const [sidebarTab, setSidebarTab] = useState('sources');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);

  const go = (nextDoc, nextTab = tab, replace = false) =>
    navigate(`/p/${projectId}${nextDoc ? `/${nextDoc}/${nextTab}` : ''}`, { replace });

  // Default to the first document when none (or an unknown one) is in the URL.
  useEffect(() => {
    if (!documentsQuery.isSuccess) return;
    if ((!docId || !documents.some(d => d.id === docId)) && documents.length) go(documents[0].id, tab, true);
    if (docId && !documents.length) go(null, tab, true);
  }, [documentsQuery.isSuccess, documents, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const project = projectQuery.data;
  if (projectQuery.isError) {
    const notFound = projectQuery.error?.status === 404;
    return (
      <div className="ws-no-source" style={{ height: '100vh' }}>
        <div className="ws-no-source-card glass-panel">
          <div className="ws-no-source-icon">{notFound ? '🔍' : '⚠️'}</div>
          <div className="ws-no-source-title">{notFound ? 'Project not found' : 'Could not load the project'}</div>
          <div className="ws-no-source-desc">{notFound ? 'It may have been deleted, or it belongs to another access key.' : projectQuery.error?.message}</div>
          <Link className="btn-generate" to="/">← Back to projects</Link>
        </div>
      </div>
    );
  }
  if (!project) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Loading project…</div>;

  const artifacts = artifactsQuery.data || {};

  return (
    <div className="ws-root">
      <nav className="ws-topnav">
        <button className="ws-back-btn" onClick={() => navigate('/')}>← Back</button>
        <div className="ws-breadcrumb">
          <span className="ws-breadcrumb-sep">/</span>
          <span>{project.icon}</span>
          <span className="ws-breadcrumb-active">{project.name}</span>
          {activeDoc && (
            <>
              <span className="ws-breadcrumb-sep">/</span>
              <span style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cleanTitle(activeDoc)}
              </span>
            </>
          )}
        </div>
        <div className="ws-topnav-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-active)', borderRadius: 99, border: '1px solid var(--border-med)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'loadPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connected</span>
          </div>
        </div>
      </nav>

      <div className="ws-layout">
        <aside className="ws-panel">
          <div className="ws-panel-head">
            <div className="ws-project-pill">
              <div className="ws-project-pill-icon" style={{ '--card-color': project.color, '--card-color2': project.color2 }}>{project.icon}</div>
              <div>
                <div className="ws-project-pill-name">{project.name}</div>
                <div className="ws-project-pill-count">{documents.length} source{documents.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          <div className="ws-sidebar-switcher">
            <button className={`ws-sidebar-tab-btn${sidebarTab === 'sources' ? ' active' : ''}`} onClick={() => setSidebarTab('sources')}>
              <span>📄</span> Sources ({documents.length})
            </button>
            <button className={`ws-sidebar-tab-btn${sidebarTab === 'notes' ? ' active' : ''}`} onClick={() => setSidebarTab('notes')}>
              <span>📝</span> Notes
            </button>
          </div>

          {sidebarTab === 'sources' ? (
            <SourcesPanel
              projectId={projectId}
              documents={documents}
              activeDocId={activeDoc?.id}
              onSelect={id => go(id)}
              onUploaded={id => go(id)}
            />
          ) : (
            <NotesPanel projectId={projectId} docId={activeDoc?.id} />
          )}
        </aside>

        <main className="ws-studio">
          <div className="ws-tab-bar" role="tablist">
            {TABS.map(t => {
              const hasContent = Boolean(artifacts[t.id]);
              const isRunning = Boolean(activeDoc && generation.running[slotKey(activeDoc.id, t.id)]);
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`ws-tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => activeDoc ? go(activeDoc.id, t.id) : null}
                >
                  <span className="ws-tab-icon">{t.icon}</span>
                  {t.label}
                  {isRunning ? <span className="ws-tab-dot" style={{ animation: 'loadPulse 1s ease-in-out infinite' }} /> : hasContent && <span className="ws-tab-dot" />}
                </button>
              );
            })}
          </div>

          <div className="ws-tab-content">
            {documentsQuery.isLoading ? (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Loading sources…</div>
            ) : (
              <StudioPanel
                project={project}
                documents={documents}
                activeDoc={activeDoc}
                tab={tab}
                artifacts={artifacts}
                artifactsLoading={artifactsQuery.isLoading}
                generation={generation}
                options={options}
                setOption={(k, v) => setOptions(prev => ({ ...prev, [k]: v }))}
                onTabChange={t => activeDoc && go(activeDoc.id, t)}
                onSelectDoc={id => go(id)}
                onUploadClick={() => { setSidebarTab('sources'); setTimeout(() => document.querySelector('.ws-upload-area input[type=file]')?.click(), 0); }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
