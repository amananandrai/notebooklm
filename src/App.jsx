import { useState } from 'react';
import ProjectsHome from './components/ProjectsHome';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectWorkspace from './components/ProjectWorkspace';
import './index.css';

export default function App() {
  const [view, setView]               = useState('projects'); // 'projects' | 'workspace'
  const [activeProject, setActiveProject] = useState(null);
  const [showCreate, setShowCreate]   = useState(false);

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
