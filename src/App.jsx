import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AUTH_REQUIRED_EVENT, CONNECTIVITY_EVENT, isOnline } from './api/client';
import AccessKeyPrompt from './components/AccessKeyPrompt';
import ProjectsHome from './components/ProjectsHome';
import CreateProjectModal from './components/CreateProjectModal';
// The workspace (viewers, exports, studio) loads on demand; the home page stays small.
const WorkspacePage = lazy(() => import('./components/workspace/WorkspacePage'));
import './index.css';

function ProjectsPage() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  return (
    <>
      <ProjectsHome onOpenProject={p => navigate(`/p/${p.id}`)} onCreateProject={() => setShowCreate(true)} />
      {showCreate && (
        <CreateProjectModal
          onCreated={p => { setShowCreate(false); navigate(`/p/${p.id}`); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}

export default function App() {
  const [offline, setOffline] = useState(!isOnline());
  const [authPrompt, setAuthPrompt] = useState(null); // { rejected } when a request got 401

  useEffect(() => {
    const onConn = e => setOffline(!e.detail?.online);
    const onAuth = e => setAuthPrompt({ rejected: Boolean(e.detail?.rejected) });
    window.addEventListener(CONNECTIVITY_EVENT, onConn);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuth);
    setOffline(!isOnline()); // a request may have failed before this listener was attached
    return () => {
      window.removeEventListener(CONNECTIVITY_EVENT, onConn);
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuth);
    };
  }, []);

  return (
    <>
      {authPrompt && <AccessKeyPrompt rejected={authPrompt.rejected} />}
      {offline && (
        <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20000, padding: '8px 16px', textAlign: 'center', fontSize: '0.85rem', background: '#b45309', color: '#fff' }}>
          ⚠️ Can't reach the server — changes can't be saved right now. Retrying when you act again.
        </div>
      )}
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route
          path="/p/:projectId/:docId?/:tab?"
          element={<Suspense fallback={<div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Loading…</div>}><WorkspacePage /></Suspense>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
