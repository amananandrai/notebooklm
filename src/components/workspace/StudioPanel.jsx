import { lazy, Suspense } from 'react';
import MindMapViewer from '../MindMapViewer';
import AudioPlayer from '../AudioPlayer';
import SlideDeckViewer from '../SlideDeckViewer';
import SlidesWithImagesViewer from '../SlidesWithImagesViewer';
import InfographicViewer from '../InfographicViewer';
import StudyGuideViewer from '../StudyGuideViewer';
import ReportViewer from '../ReportViewer';
import SynthesisViewer from '../SynthesisViewer';
import DataTableViewer from '../DataTableViewer';
import ChatAssistant from '../ChatAssistant';
import GenerateOptions from './GenerateOptions';
import { optionsFor } from './options';
import { downloadArtifact } from './downloads';
import { TAB_META, cleanTitle } from './tabs';
import { slotKey } from '../../hooks/useGenerate';
import { askQuestion } from '../../api/endpoints';
import { useSaveChat } from '../../hooks/queries';

// Heavy, rarely-opened tab loads on demand (three.js studio).
const VideoStudio = lazy(() => import('../VideoStudio'));

function TabLoading({ label = 'Loading…' }) {
  return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>{label}</div>;
}

const VIEWERS = {
  mindmap: (a) => <MindMapViewer data={a} />,
  audio: (a) => <AudioPlayer script={a} />,
  infographic: (a) => <InfographicViewer data={a} />,
  report: (a) => <ReportViewer data={a} />,
  datatable: (a) => <DataTableViewer data={a} />,
  synthesis: (a) => <SynthesisViewer data={a} />,
  studyguide: (a) => <StudyGuideViewer data={a} />,
};

export default function StudioPanel({
  project, documents, activeDoc, tab, artifacts, artifactsLoading, generation, options, setOption,
  onTabChange, onSelectDoc, onUploadClick,
}) {
  const saveChat = useSaveChat(project.id, activeDoc?.id);

  // Case 1: no PDFs uploaded yet
  if (documents.length === 0) {
    return (
      <div className="ws-no-source">
        <div className="ws-no-source-card glass-panel">
          <div className="ws-no-source-icon">📄</div>
          <div className="ws-no-source-title">Upload a PDF to get started</div>
          <div className="ws-no-source-desc">
            Upload your research papers, textbooks, or documents to generate AI Audio Podcasts, 3D Video Presentations, Slides, Infographics, Study Guides, and interactive Chat.
          </div>
          <button className="btn-generate" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 14 }} onClick={onUploadClick}>
            <span>⬆</span> Upload PDF Document
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Supports PDF documents up to 50MB</div>
        </div>
      </div>
    );
  }

  // Case 2: documents exist but none selected
  if (!activeDoc) {
    return (
      <div className="ws-no-source">
        <div className="ws-no-source-card glass-panel">
          <div className="ws-no-source-icon">📂</div>
          <div className="ws-no-source-title">Select a Document Source</div>
          <div className="ws-no-source-desc">Choose a document below to view its insights and workspace tools.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
            {documents.map(src => (
              <div key={src.id} className="ws-source-item" style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)' }} onClick={() => onSelectDoc(src.id)}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{cleanTitle(src)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{src.pages} pages · {(src.words || 0).toLocaleString()} words</div>
                </div>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>Select →</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (artifactsLoading) return <TabLoading label="Loading saved results…" />;

  const artifact = artifacts?.[tab];
  const slot = slotKey(activeDoc.id, tab);
  const running = generation.running[slot];
  const err = generation.errors[slot];
  const runTool = (force) => generation.run(activeDoc.id, tab, optionsFor(tab, options), { force });

  if (tab === 'chat') {
    return (
      <ChatAssistant
        key={activeDoc.id}
        docTitle={activeDoc.title}
        onAskQuestion={(question, history) => askQuestion(project.id, activeDoc.id, question, history)}
        initialMessages={artifact || []}
        onSaveMessages={msgs => saveChat.mutate(msgs)}
      />
    );
  }

  if (tab === 'video') {
    const audioData = artifacts?.audio;
    const slidesData = artifacts?.slides;
    if (!audioData || !slidesData) {
      return (
        <div className="studio-empty">
          <div className="studio-empty-icon">🎬</div>
          <div className="studio-empty-title">Setup 3D Video Studio</div>
          <div className="studio-empty-desc">
            To record the 3D podcast presentation, you need to generate both the <strong>Audio Overview</strong> and the <strong>Slide Deck</strong> for this document first.
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: audioData ? 'var(--green)' : 'var(--text-muted)' }}>
              {audioData ? '✓ 🎙️ Audio Podcast Generated' : '⏳ 🎙️ Audio Podcast Missing'}
            </div>
            <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: slidesData ? 'var(--green)' : 'var(--text-muted)' }}>
              {slidesData ? '✓ 📊 Slide Deck Generated' : '⏳ 📊 Slide Deck Missing'}
            </div>
          </div>
          <button className="btn-generate" onClick={() => onTabChange(!audioData ? 'audio' : 'slides')}>Go to Generate →</button>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="studio-content-header video-studio-shell-header">
          <div className="studio-content-title">
            🎬 3D Video Studio
            <span className="studio-content-badge">WebGL Interactive</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-regen" onClick={() => downloadArtifact('video', artifacts, activeDoc)}
              style={{ background: 'var(--bg-active)', borderColor: 'var(--border-hi)', color: 'var(--text-primary)' }}>
              ⬇ Export Presentation Script
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<TabLoading />}><VideoStudio slides={slidesData} script={audioData} /></Suspense>
        </div>
      </div>
    );
  }

  const meta = TAB_META[tab];

  if (running) {
    return (
      <div className="studio-empty">
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid var(--accent-dim)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
        <div className="studio-empty-title loading-pulse">Generating {meta.title}...</div>
        <div className="studio-empty-desc">The AI is reading your document and crafting {meta.title.toLowerCase()} content.</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }} aria-live="polite">
          {running.elapsed ? `Still working… ${running.elapsed}s` : 'Usually 10–30 seconds; long documents take longer.'}
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="studio-empty">
        <div className="studio-empty-icon">{meta.icon}</div>
        <div className="studio-empty-title">Generate {meta.title}</div>
        <div className="studio-empty-desc">{meta.desc}</div>
        <GenerateOptions tab={tab} options={options} set={setOption} />
        <div className="studio-empty-features">
          {meta.feats.map(f => <span key={f} className="studio-empty-feat">✓ {f}</span>)}
        </div>
        {err && (
          <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16, padding: '8px 16px', background: '#ef444412', borderRadius: 8, border: '1px solid #ef444430' }}>
            ⚠ {err}
          </div>
        )}
        <button className="btn-generate" onClick={() => runTool(false)}>
          <span>⚡</span>
          Generate {meta.title}
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          {tab === 'synthesis' ? 'Uses every source in this project' : 'AI-generated from this document'}
        </div>
      </div>
    );
  }

  const header = (
    <div className="studio-content-header">
      <div className="studio-content-title">
        {meta.icon} {meta.title}
        <span className="studio-content-badge">AI Generated</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {err && <span role="alert" style={{ color: 'var(--red)', fontSize: 12, maxWidth: 360 }}>⚠ {err}</span>}
        <button className="btn-regen" onClick={() => downloadArtifact(tab, artifacts, activeDoc)}
          style={{ background: 'var(--bg-active)', borderColor: 'var(--border-hi)', color: 'var(--text-primary)' }}>
          ⬇ Download
        </button>
        <button className="btn-regen" onClick={() => runTool(true)}>↺ Regenerate</button>
      </div>
    </div>
  );

  let body;
  if (tab === 'slides') {
    body = <SlideDeckViewer slides={artifact} docTitle={cleanTitle(activeDoc)} activeTheme={options.deckTheme} onThemeChange={v => setOption('deckTheme', v)} />;
  } else if (tab === 'slides_img') {
    body = <SlidesWithImagesViewer slides={artifact} docTitle={cleanTitle(activeDoc)} activeTheme={options.imageSlideTheme} onThemeChange={v => setOption('imageSlideTheme', v)} />;
  } else {
    body = VIEWERS[tab]?.(artifact);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {header}
      <div style={{ flex: 1, overflow: 'hidden' }}>{body}</div>
    </div>
  );
}
