import { useState, useEffect } from 'react';
import { isUsingFallback, onFallbackChange } from './utils/storage';
import { AUTH_REQUIRED_EVENT } from './utils/api';
import AccessKeyPrompt from './components/AccessKeyPrompt';
import ProjectsHome from './components/ProjectsHome';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectWorkspace from './components/ProjectWorkspace';
import './index.css';

export default function App() {
  const [view, setView]               = useState('projects'); // 'projects' | 'workspace'
  const [activeProject, setActiveProject] = useState(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [offline, setOffline]         = useState(isUsingFallback());

  useEffect(() => onFallbackChange(setOffline), []);

  // Set when any API call is rejected with 401; `rejected` means a saved key was refused.
  const [authPrompt, setAuthPrompt] = useState(null);
  useEffect(() => {
    const onAuth = e => setAuthPrompt({ rejected: Boolean(e.detail?.rejected) });
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuth);
  }, []);

  function handleOpenProject(project) {
    setActiveProject(project);
    setView('workspace');
  }

  function handleProjectCreated(project) {
    setShowCreate(false);
    setActiveProject(project);
    setView('workspace');
  }

  function handleBack() {
    setView('projects');
    setActiveProject(null);
  }

  return (
    <>
      {authPrompt && <AccessKeyPrompt rejected={authPrompt.rejected} />}
      {offline && (
        <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20000, padding: '8px 16px', textAlign: 'center', fontSize: '0.85rem', background: '#b45309', color: '#fff' }}>
          ⚠️ Can't reach the server — your changes are only kept in this tab and will be lost on refresh.
        </div>
      )}
      {view === 'projects' && (
        <ProjectsHome
          key="projects-home"
          onOpenProject={handleOpenProject}
          onCreateProject={() => setShowCreate(true)}
        />
      )}

      {view === 'workspace' && activeProject && (
        <ProjectWorkspace
          key={activeProject.id}
          project={activeProject}
          onBack={handleBack}
        />
      )}

      {showCreate && (
        <CreateProjectModal
          onCreated={handleProjectCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
