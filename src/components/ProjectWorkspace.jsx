import { useState, useRef, useEffect } from 'react';
import { parsePDFFile } from '../utils/pdfParser';
import { saveDocument, getDocument, deleteDocument, getArtifact, saveArtifact, deleteArtifactsForDoc, loadProjects } from '../utils/storage';
import MindMapViewer from './MindMapViewer';
import AudioPlayer from './AudioPlayer';
import SlideDeckViewer from './SlideDeckViewer';
import SlidesWithImagesViewer from './SlidesWithImagesViewer';
import InfographicViewer from './InfographicViewer';
import StudyGuideViewer from './StudyGuideViewer';
import ChatAssistant from './ChatAssistant';
import VideoStudio from './VideoStudio';
import VideoExportStudio from '../video/VideoExportStudio';
import HyperFramesStudio from '../video/HyperFramesStudio';

const MCP_ENDPOINT = window.location.origin.includes('5173') || window.location.origin.includes('localhost')
  ? 'http://127.0.0.1:8080/mcp'
  : '/mcp';

const TABS = [
  { id: 'hyperframes', label: 'HyperFrames', icon: 'HF' },
  { id: 'mindmap',    label: 'Mind Map',        icon: '🧠' },
  { id: 'audio',      label: 'Audio',           icon: '🎙️' },
  { id: 'slides',     label: 'Slides',          icon: '📊' },
  { id: 'slides_img', label: 'Slides + Images', icon: '🖼️' },
  { id: 'infographic',label: 'Infographic',     icon: '📈' },
  { id: 'video',      label: 'Video Studio',    icon: '🎬' },
  { id: 'studyguide', label: 'Study Guide',     icon: '🎴' },
  { id: 'chat',       label: 'Chat',            icon: '💬' },
];

const TAB_META = {
  hyperframes: { title: 'HyperFrames Studio', desc: 'Create deterministic HTML-based videos from slides, text, diagrams, and reusable visual templates.', icon: 'HF', feats: ['HTML video templates', 'Frame-accurate captions', 'Landscape, square, and vertical exports'] },
  mindmap:    { title: 'Mind Map',           desc: 'Gemini will extract the key concepts, sections, and relationships from your PDF and build an interactive hierarchical mind map.',  icon: '🧠', feats: ['Hierarchical nodes', 'Color-coded categories', 'Interactive zoom & pan'] },
  audio:      { title: 'Audio Overview',     desc: 'Gemini will generate a two-host podcast-style conversation exploring the key ideas in your document — just like NotebookLM.', icon: '🎙️', feats: ['Two-host dialogue', 'Natural conversation', 'Document-grounded facts'] },
  slides:     { title: 'Slide Deck',         desc: 'Gemini will create a professional slide deck with titles, bullets, and speaker notes derived from your PDF\'s real content.',       icon: '📊', feats: ['5 structured slides', 'Speaker notes', 'Real document content'] },
  slides_img: { title: 'Slides with Images', desc: 'Gemini creates a full slide deck AND generates a unique AI image for each slide using Gemini Imagen — vivid visuals that match your content.', icon: '🖼️', feats: ['AI image per slide via Imagen', 'Full-bleed visual backgrounds', 'Animated slide transitions'] },
  infographic:{ title: 'Infographic',        desc: 'Gemini analyzes your document and generates a rich visual infographic with key stats, color-coded sections, a timeline, and a key insight.', icon: '📈', feats: ['Key metric stats', 'Section summaries', 'Timeline & key insight'] },
  video:      { title: '3D Video Studio',    desc: 'Visualize your slides and podcast audio in an interactive 3D WebGL Recording Studio with animated low-poly hosts.',      icon: '🎬', feats: ['Live 3D WebGL scene', 'Lipsync avatar animations', 'Synchronized blackboard slides'] },
  studyguide: { title: 'Study Guide',        desc: 'Gemini will generate flashcards and multiple-choice quiz questions grounded in your PDF to help you study the material.',          icon: '🎴', feats: ['6 flashcards', '4 quiz questions', 'Spaced repetition ready'] },
  chat:       { title: 'Q&A Chat',           desc: 'Ask anything about your PDF. Gemini will answer every question grounded in the actual document content with citations.',           icon: '💬', feats: ['Document-grounded answers', 'Citations included', 'Natural conversation'] },
};

async function callMCP(tool, args) {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: 1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.result.content[0].text);
}

export default function ProjectWorkspace({ project, onBack }) {
  const [sources, setSources]           = useState([]);   // loaded doc metadata
  const [activeDocId, setActiveDocId]   = useState(null);
  const [activeTab, setActiveTab]       = useState('mindmap');
  const [ocrState, setOcrState]         = useState(null); // { fileName, progress, status }
  const [isDragOver, setIsDragOver]     = useState(false);
  const [artifacts, setArtifacts]       = useState({});   // { [docId_tab]: data }
  const [generating, setGenerating]     = useState({});   // { [docId_tab]: bool }
  const [genError, setGenError]         = useState({});   // { [docId_tab]: string }
  const fileInputRef = useRef();

  // Load stored docs when project opens
  useEffect(() => {
    async function loadDocs() {
      const projects = await loadProjects();
      const proj = projects.find(p => p.id === project.id);
      if (!proj?.sourceIds?.length) return;
      const docs = await Promise.all(proj.sourceIds.map(id => getDocument(id)));
      const valid = docs.filter(Boolean);
      setSources(valid.map(d => ({ id: d.id, title: d.title, pages: d.pages, words: d.words, uploadedAt: d.uploadedAt })));
      if (valid.length > 0) handleDocChange(valid[0].id);
    }
    loadDocs();
  }, []);

  // Load a cached artifact
  async function loadArtifact(docId, tab) {
    const key = `${docId}_${tab}`;
    if (artifacts[key] !== undefined) return artifacts[key];
    const cached = await getArtifact(project.id, docId, tab);
    if (cached) {
      setArtifacts(prev => ({ ...prev, [key]: cached }));
    }
    return cached;
  }

  // When active doc or tab changes, try to load cached artifact
  async function handleTabChange(tab) {
    setActiveTab(tab);
    if (activeDocId) {
      await loadArtifact(activeDocId, tab);
    }
  }

  async function handleDocChange(docId) {
    setActiveDocId(docId);
    await loadArtifact(docId, activeTab);
  }

  // ── Upload ────────────────────────────────────────────────────
  async function processFile(file) {
    if (!file?.name?.endsWith('.pdf')) return;
    setOcrState({ fileName: file.name, progress: 0, status: 'Starting...' });
    try {
      const doc = await parsePDFFile(file, ({ status, progress }) => {
        setOcrState({ fileName: file.name, progress, status });
      });
      await saveDocument(project.id, doc);
      setSources(prev => {
        const already = prev.find(s => s.id === doc.id);
        if (already) return prev;
        return [...prev, { id: doc.id, title: doc.title, pages: doc.pages, words: doc.words, uploadedAt: doc.uploadedAt }];
      });
      setActiveDocId(doc.id);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setTimeout(() => setOcrState(null), 800);
    }
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(processFile);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
    files.forEach(processFile);
  }

  // ── Delete source ─────────────────────────────────────────────
  async function handleDeleteSource(docId) {
    if (!confirm('Remove this PDF from the project?')) return;
    await deleteDocument(project.id, docId);
    await deleteArtifactsForDoc(project.id, docId);
    setSources(prev => prev.filter(s => s.id !== docId));
    setArtifacts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(docId)) delete next[k]; });
      return next;
    });
    if (activeDocId === docId) setActiveDocId(sources.find(s => s.id !== docId)?.id || null);
  }

  // ── Generate ──────────────────────────────────────────────────
  async function handleGenerate(tab) {
    if (!activeDocId) return;
    const key = `${activeDocId}_${tab}`;
    setGenerating(prev => ({ ...prev, [key]: true }));
    setGenError(prev => ({ ...prev, [key]: null }));

    const toolMap = {
      mindmap:     'generate_mindmap',
      audio:       'generate_audio_overview',
      slides:      'generate_slide_deck',
      slides_img:  'generate_slides_with_images',
      infographic: 'generate_infographic',
      studyguide:  'generate_study_guide',
    };

    try {
      const doc = await getDocument(activeDocId);
      if (!doc) throw new Error('Document not found in storage.');
      const result = await callMCP(toolMap[tab], { documentTitle: doc.title, rawText: doc.rawText });
      await saveArtifact(project.id, activeDocId, tab, result);
      setArtifacts(prev => ({ ...prev, [key]: result }));
    } catch (err) {
      setGenError(prev => ({ ...prev, [key]: err.message }));
    } finally {
      setGenerating(prev => ({ ...prev, [key]: false }));
    }
  }

  function handleDownloadArtifact(tab) {
    if (!activeDocId || !activeDoc) return;
    
    let content = '';
    let fileName = '';
    const mimeType = 'text/plain';

    if (tab === 'video') {
      fileName = `${activeDoc.title.replace('.pdf', '')}_Presentation_Script.md`;
      const audioKey = `${activeDocId}_audio`;
      const slidesKey = `${activeDocId}_slides`;
      const audioData = artifacts[audioKey] || [];
      const slidesData = artifacts[slidesKey] || [];
      
      content = `# Full 3D Presentation Script & Slides — ${activeDoc.title}\n\n`;
      content += `## 🎙️ Podcast Audio Dialogue Script\n\n` + 
        audioData.map(turn => `**${turn.speaker}**: ${turn.text}`).join('\n\n') + '\n\n';
      content += `---\n\n## 📊 Slide Deck Outline\n\n` + 
        slidesData.map((s, idx) => `### Slide ${idx + 1}: ${s.title}\n*Bullets:*\n${(s.bullets || []).map(b => `- ${b}`).join('\n')}\n\n*Speaker Notes:* ${s.speakerNotes || 'N/A'}\n`).join('\n---\n\n');
    }
    
    else {
      const key = `${activeDocId}_${tab}`;
      const data = artifacts[key];
      if (!data) return;

      if (tab === 'mindmap') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_MindMap.md`;
        
        function formatNode(node, depth = 0) {
          let str = '  '.repeat(depth) + `- **${node.label}** (${node.category || 'Concept'})\n`;
          if (node.description) {
            str += '  '.repeat(depth + 1) + `*Description:* ${node.description}\n`;
          }
          if (node.children?.length) {
            node.children.forEach(c => {
              str += formatNode(c, depth + 1);
            });
          }
          return str;
        }
        content = `# Mind Map Tree — ${activeDoc.title}\n\n${formatNode(data)}`;
      }
      
      else if (tab === 'audio') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_AudioScript.txt`;
        content = `NotebookLM Podcast Dialogue Script - ${activeDoc.title}\n\n` + 
          data.map(turn => `[${turn.speaker}]: ${turn.text}`).join('\n\n');
      }
      
      else if (tab === 'slides') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_Slides.md`;
        content = `# Slides Presentation Outline — ${activeDoc.title}\n\n` + 
          data.map((s, idx) => {
            let slideStr = `## Slide ${idx + 1}: ${s.title}\n`;
            if (s.subtitle) slideStr += `*${s.subtitle}*\n\n`;
            slideStr += (s.bullets || []).map(b => `- ${b}`).join('\n') + '\n\n';
            if (s.speakerNotes) slideStr += `**Speaker Notes:** *${s.speakerNotes}*\n\n`;
            return slideStr;
          }).join('---\n\n');
      }
      
      else if (tab === 'slides_img') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_SlidesWithImages.md`;
        content = `# Slides with Images — ${activeDoc.title}\n\n` +
          data.map((s, idx) => {
            let slideStr = `## Slide ${idx + 1}: ${s.title}\n`;
            if (s.subtitle) slideStr += `*${s.subtitle}*\n\n`;
            slideStr += (s.bullets || []).map(b => `- ${b}`).join('\n') + '\n\n';
            if (s.speakerNotes) slideStr += `**Speaker Notes:** *${s.speakerNotes}*\n\n`;
            if (s.imagePrompt) slideStr += `**Image Prompt:** ${s.imagePrompt}\n\n`;
            return slideStr;
          }).join('---\n\n');
      }

      else if (tab === 'infographic') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_Infographic.md`;
        const stats = data.stats || [];
        const sections = data.sections || [];
        const timeline = data.timeline || [];
        content = `# Infographic — ${data.title || activeDoc.title}\n\n`;
        content += `**Summary:** ${data.subtitle || ''}\n\n`;
        content += `## Key Metrics\n\n`;
        content += stats.map(s => `- **${s.label}:** ${s.value} ${s.icon}  \n  *${s.desc}*`).join('\n') + '\n\n';
        content += `## Sections\n\n`;
        content += sections.map(s => `### ${s.icon} ${s.title}\n${s.summary}\n`).join('\n');
        content += `\n## Timeline\n\n`;
        content += timeline.map(t => `${t.step}. **${t.label}** — ${t.desc}`).join('\n') + '\n\n';
        if (data.keyInsight) content += `## Key Insight\n\n> ${data.keyInsight}\n`;
      }

      else if (tab === 'studyguide') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_StudyGuide.md`;
        const flashcards = data.flashcards || [];
        const quiz = data.quiz || [];
        
        content = `# Study Guide — ${activeDoc.title}\n\n`;
        content += `## 🎴 Flashcards (${flashcards.length})\n\n`;
        content += flashcards.map((f, i) => `### Flashcard ${i + 1}\n**Category:** ${f.category}\n**Question:** ${f.question}\n**Answer:** ${f.answer}\n`).join('\n---\n\n');
        
        content += `\n\n## 🧩 Quiz Questions (${quiz.length})\n\n`;
        content += quiz.map((q, i) => {
          let qStr = `### Question ${i + 1}\n**Question:** ${q.question}\n`;
          qStr += (q.options || []).map((o, oi) => `   ${String.fromCharCode(65 + oi)}) ${o}`).join('\n') + '\n';
          qStr += `**Correct Option:** ${String.fromCharCode(65 + q.correctIndex)}\n`;
          if (q.explanation) qStr += `**Explanation:** ${q.explanation}\n`;
          return qStr;
        }).join('\n---\n\n');
      }
    }

    if (!content) return;

    // Trigger standard browser download anchor
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Chat sends a question to MCP
  async function handleChatQuestion(question) {
    const doc = await getDocument(activeDocId);
    if (!doc) throw new Error('Document not found.');
    return callMCP('answer_question', { documentTitle: doc.title, rawText: doc.rawText, question });
  }

  // ── Render helpers ─────────────────────────────────────────────
  const activeDoc = sources.find(s => s.id === activeDocId);

  function renderStudio() {
    if (!activeDocId || !activeDoc) {
      return (
        <div className="ws-no-source">
          <div className="ws-no-source-icon">📂</div>
          <div className="ws-no-source-title">No source selected</div>
          <div className="ws-no-source-desc">Upload a PDF on the left, then select it to start generating insights.</div>
        </div>
      );
    }

    const key = `${activeDocId}_${activeTab}`;
    const artifact = artifacts[key];
    const isGen    = generating[key];
    const err      = genError[key];

    if (activeTab === 'chat') {
      return (
        <ChatAssistant
          key={activeDocId}
          docTitle={activeDoc.title}
          onAskQuestion={handleChatQuestion}
          initialMessages={artifact || []}
          onSaveMessages={msgs => {
            setArtifacts(prev => ({ ...prev, [key]: msgs }));
            saveArtifact(project.id, activeDocId, 'chat', msgs);
          }}
        />
      );
    }

    if (activeTab === 'hyperframes') {
      const audioData = artifacts[`${activeDocId}_audio`];
      const slidesData = artifacts[`${activeDocId}_slides`];
      if (!audioData || !slidesData) {
        return <div className="studio-empty"><div className="studio-empty-icon">HF</div><div className="studio-empty-title">Generate audio and slides first</div><div className="studio-empty-desc">HyperFrames uses the same narration and slide data as Video Studio.</div><button className="btn-generate" onClick={() => handleTabChange(!audioData ? 'audio' : 'slides')}>Go to Generate →</button></div>;
      }
      return <div style={{ height: '100%' }}><HyperFramesStudio slides={slidesData} script={audioData} /></div>;
    }

    if (activeTab === 'video') {
      const audioKey = `${activeDocId}_audio`;
      const slidesKey = `${activeDocId}_slides`;
      const audioData = artifacts[audioKey];
      const slidesData = artifacts[slidesKey];

      if (!audioData || !slidesData) {
        return (
          <div className="studio-empty">
            <div className="studio-empty-icon">🎬</div>
            <div className="studio-empty-title">Setup 3D Video Studio</div>
            <div className="studio-empty-desc">
              To record the 3D podcast presentation, you need to generate both the **Audio Overview** and the **Slide Deck** for this document first.
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
              <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: audioData ? 'var(--green)' : 'var(--text-muted)' }}>
                {audioData ? '✓ 🎙️ Audio Podcast Generated' : '⏳ 🎙️ Audio Podcast Missing'}
              </div>
              <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: slidesData ? 'var(--green)' : 'var(--text-muted)' }}>
                {slidesData ? '✓ 📊 Slide Deck Generated' : '⏳ 📊 Slide Deck Missing'}
              </div>
            </div>
            <button
              className="btn-generate"
              onClick={() => {
                if (!audioData) handleTabChange('audio');
                else if (!slidesData) handleTabChange('slides');
              }}
            >
              Go to Generate →
            </button>
          </div>
        );
      }

      return (
        <div className="video-studio-shell">
          <div className="studio-content-header video-studio-shell-header">
            <div className="studio-content-title">
              🎬 3D Video Studio
              <span className="studio-content-badge">WebGL Interactive</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-regen"
                onClick={() => handleDownloadArtifact('video')}
                style={{ background: 'var(--bg-active)', borderColor: 'var(--border-hi)', color: 'var(--text-primary)' }}
              >
                ⬇ Export Presentation Script
              </button>
            </div>
          </div>
          <div className="video-studio-workspace">
            <section className="video-studio-card video-live-card">
              <div className="video-studio-card-header">
                <div>
                  <div className="video-studio-card-title">Live studio</div>
                  <div className="video-studio-card-subtitle">Preview hosts, blackboard, captions, and narration</div>
                </div>
                <span className="video-studio-card-status"><span /> Ready</span>
              </div>
              <div className="video-studio-card-body"><VideoStudio slides={slidesData} script={audioData} /></div>
            </section>
            <section className="video-studio-card video-export-card">
              <div className="video-studio-card-header">
                <div>
                  <div className="video-studio-card-title">Render &amp; export</div>
                  <div className="video-studio-card-subtitle">Choose a format, review the frame, and download MP4</div>
                </div>
                <span className="video-studio-card-kicker">REMOTION</span>
              </div>
              <div className="video-studio-card-body"><VideoExportStudio slides={slidesData} script={audioData} /></div>
            </section>
          </div>
        </div>
      );
    }

    const meta = TAB_META[activeTab];

    // Empty state
    if (!artifact && !isGen) {
      return (
        <div className="studio-empty">
          <div className="studio-empty-icon">{meta.icon}</div>
          <div className="studio-empty-title">Generate {meta.title}</div>
          <div className="studio-empty-desc">
            {meta.desc}
          </div>
          <div className="studio-empty-features">
            {meta.feats.map(f => (
              <span key={f} className="studio-empty-feat">✓ {f}</span>
            ))}
          </div>
          {err && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16, padding: '8px 16px', background: '#ef444412', borderRadius: 8, border: '1px solid #ef444430' }}>
              ⚠ {err}
            </div>
          )}
          <button
            className="btn-generate"
            onClick={() => handleGenerate(activeTab)}
          >
            <span>⚡</span>
            Generate {meta.title}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Uses Gemini Flash · ~5–10 seconds
          </div>
        </div>
      );
    }

    // Loading state
    if (isGen) {
      return (
        <div className="studio-empty">
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid var(--accent-dim)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
          <div className="studio-empty-title loading-pulse">Generating {meta.title}...</div>
          <div className="studio-empty-desc">Gemini Flash is reading your document and crafting {meta.title.toLowerCase()} content.</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>This takes ~5–10 seconds</div>
        </div>
      );
    }

    // Has content
    const contentHeader = (
      <div className="studio-content-header">
        <div className="studio-content-title">
          {meta.icon} {meta.title}
          <span className="studio-content-badge">Gemini Generated</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-regen"
            onClick={() => handleDownloadArtifact(activeTab)}
            style={{ background: 'var(--bg-active)', borderColor: 'var(--border-hi)', color: 'var(--text-primary)' }}
          >
            ⬇ Download
          </button>
          {activeTab !== 'video' && (
            <button
              className="btn-regen"
              onClick={() => handleGenerate(activeTab)}
              disabled={isGen}
            >
              {isGen ? '⏳' : '↺'} Regenerate
            </button>
          )}
        </div>
      </div>
    );



    if (activeTab === 'mindmap')    return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><MindMapViewer data={artifact} /></div></div></>;
    if (activeTab === 'audio')      return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><AudioPlayer script={artifact} /></div></div></>;
    if (activeTab === 'slides')     return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><SlideDeckViewer slides={artifact} /></div></div></>;
    if (activeTab === 'slides_img') return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><SlidesWithImagesViewer slides={artifact} docTitle={activeDoc.title.replace('.pdf', '')} /></div></div></>;
    if (activeTab === 'infographic')return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><InfographicViewer data={artifact} /></div></div></>;
    if (activeTab === 'studyguide') return <><div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{contentHeader}<div style={{ flex: 1, overflow: 'hidden' }}><StudyGuideViewer data={artifact} /></div></div></>;
  }

  return (
    <div className="ws-root">
      {/* Top nav */}
      <nav className="ws-topnav">
        <button className="ws-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="ws-breadcrumb">
          <span className="ws-breadcrumb-sep">/</span>
          <span>{project.icon}</span>
          <span className="ws-breadcrumb-active">{project.name}</span>
          {activeDoc && (
            <>
              <span className="ws-breadcrumb-sep">/</span>
              <span style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeDoc.title.replace('.pdf', '')}
              </span>
            </>
          )}
        </div>
        <div className="ws-topnav-right">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: 'var(--bg-active)', borderRadius: 99, border: '1px solid var(--border-med)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'loadPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>MCP Connected</span>
          </div>
        </div>
      </nav>

      {/* Body */}
      <div className="ws-layout">
        {/* Left panel */}
        <aside className="ws-panel">
          <div className="ws-panel-head">
            <div className="ws-project-pill">
              <div
                className="ws-project-pill-icon"
                style={{ '--card-color': project.color, '--card-color2': project.color2 }}
              >
                {project.icon}
              </div>
              <div>
                <div className="ws-project-pill-name">{project.name}</div>
                <div className="ws-project-pill-count">{sources.length} source{sources.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          <div className="ws-sources-label">Sources</div>

          <div className="ws-sources-list">
            {sources.length === 0 && !ocrState && (
              <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No PDFs yet — upload one below
              </div>
            )}
            {sources.map(src => (
              <div
                key={src.id}
                className={`ws-source-item${activeDocId === src.id ? ' active' : ''}`}
                onClick={() => handleDocChange(src.id)}
              >
                <div className="ws-source-icon">📄</div>
                <div className="ws-source-info">
                  <div className="ws-source-name">{src.title.replace('.pdf', '')}</div>
                  <div className="ws-source-meta">{src.pages}p · {(src.words || 0).toLocaleString()} words</div>
                </div>
                <button className="ws-source-del" onClick={e => { e.stopPropagation(); handleDeleteSource(src.id); }}>✕</button>
              </div>
            ))}
          </div>

          {/* OCR Progress */}
          {ocrState && (
            <div className="ocr-progress">
              <div className="ocr-progress-header">
                <div className="ocr-spinner" />
                <div>
                  <div className="ocr-label">Reading PDF...</div>
                  <div className="ocr-file">{ocrState.fileName}</div>
                </div>
              </div>
              <div className="ocr-bar-track">
                <div className="ocr-bar-fill" style={{ width: `${ocrState.progress}%` }} />
              </div>
              <div className="ocr-status">{ocrState.status}</div>
            </div>
          )}

          {/* Upload zone */}
          <div className="ws-upload-area">
            <div
              className={`ws-upload-zone${isDragOver ? ' dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileInput} style={{ display: 'none' }} />
              <div className="ws-upload-zone-icon">⬆</div>
              <div className="ws-upload-zone-text">Upload PDF</div>
              <div className="ws-upload-zone-hint">Click or drag & drop</div>
            </div>
          </div>
        </aside>

        {/* Studio */}
        <main className="ws-studio">
          {/* Tab bar */}
          <div className="ws-tab-bar">
            {TABS.map(tab => {
              const key = `${activeDocId}_${tab.id}`;
              const hasContent = !!artifacts[key];
              return (
                <button
                  key={tab.id}
                  className={`ws-tab${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span className="ws-tab-icon">{tab.icon}</span>
                  {tab.label}
                  {hasContent && <span className="ws-tab-dot" />}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="ws-tab-content">
            {renderStudio()}
          </div>
        </main>
      </div>
    </div>
  );
}
