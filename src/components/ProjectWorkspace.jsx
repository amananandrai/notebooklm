import { useState, useRef, useEffect } from 'react';
import { parsePDFFile } from '../utils/pdfParser';
import { saveDocument, getDocument, deleteDocument, getArtifact, saveArtifact, deleteArtifactsForDoc, loadProjects, loadDocumentsForProject } from '../utils/storage';
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

async function callMCP(toolName, args) {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || 'MCP tool call error');
  }

  const textContent = json.result?.content?.find(c => c.type === 'text')?.text;
  if (!textContent) {
    throw new Error('Empty response from MCP tool');
  }

  try {
    return JSON.parse(textContent);
  } catch {
    return textContent;
  }
}

const TABS = [
  { id: 'mindmap',     label: 'Mind Map',     icon: '🧠' },
  { id: 'audio',       label: 'Audio',        icon: '🎙️' },
  { id: 'slides',      label: 'Slides',       icon: '📊' },
  { id: 'slides_img',  label: 'Slides + Images', icon: '🖼️' },
  { id: 'infographic', label: 'Infographic',  icon: '📈' },
  { id: 'video',       label: 'Video Studio', icon: '🎬' },
  { id: 'studyguide',  label: 'Study Guide',  icon: '📕' },
  { id: 'hyperframes', label: 'HF HyperFrames', icon: '⚡' },
  { id: 'chat',        label: 'Chat',         icon: '💬' },
];

const TAB_META = {
  mindmap:     { title: 'Mind Map',     icon: '🧠', desc: 'Visual concept hierarchy of key ideas and their relationships.', feats: ['Interactive node tree', 'Category coloring', 'Expand/collapse branches'] },
  audio:       { title: 'Audio Podcast', icon: '🎙️', desc: 'Two AI hosts discussing your document in an engaging conversation.', feats: ['Alex & Jordan hosts', 'Natural voice synthesis', 'Interactive transcript'] },
  slides:      { title: 'Slide Deck',   icon: '📊', desc: 'Presentation slides with key points and speaker notes.', feats: ['Title & content slides', 'Speaker notes included', 'Export ready format'] },
  slides_img:  { title: 'Slides + Images', icon: '🖼️', desc: 'Presentation slides enhanced with AI-generated visual illustrations.', feats: ['Flux Realism generated visuals', 'High-res image backgrounds', 'PDF & PPTX exports'] },
  infographic: { title: 'Infographic',  icon: '📈', desc: 'Visual data summary with key metrics, timeline, and core takeaways.', feats: ['Metrics grid', 'Core sections cards', 'Timeline flow'] },
  video:       { title: '3D Video Studio', icon: '🎬', desc: 'Interactive 3D presentation studio with AI hosts and blackboard.', feats: ['Interactive 3D avatars', 'Blackboard sync', 'Live presentation recording'] },
  studyguide:  { title: 'Study Guide',  icon: '📕', desc: 'Flashcards and quiz questions to master your document content.', feats: ['3D Flip Flashcards', 'Practice Quiz', 'Mastery tracking'] },
  hyperframes: { title: 'HyperFrames Render', icon: '⚡', desc: 'Render video timeline using HyperFrames HTML rendering engine.', feats: ['HTML Composition', 'Asynchronous Render Worker', 'Vercel Sandbox Renderer'] },
  chat:        { title: 'Chat Assistant', icon: '💬', desc: 'Ask questions and chat directly with Gemini AI about your document.', feats: ['Strict document grounding', 'Source citations', 'Download chat log'] },
};

export default function ProjectWorkspace({ project, onBack }) {
  const [sources, setSources]         = useState(project.sources || []);
  const [activeDocId, setActiveDocId] = useState(() => sources[0]?.id || null);
  const [activeTab, setActiveTab]     = useState('mindmap');
  const [artifacts, setArtifacts]     = useState({}); // { `${docId}_${tab}`: data }
  const [generating, setGenerating]   = useState({}); // { `${docId}_${tab}`: bool }
  const [genError, setGenError]       = useState({}); // { `${docId}_${tab}`: string }
  const [ocrState, setOcrState]       = useState(null); // { fileName, progress, status }
  const [isDragOver, setIsDragOver]   = useState(false);
  const fileInputRef = useRef(null);

  // Fetch document objects for project and ensure activeDocId is selected
  useEffect(() => {
    async function fetchProjectSources() {
      const loadedDocs = await loadDocumentsForProject(project.id, project.sourceIds || []);
      if (loadedDocs && loadedDocs.length > 0) {
        setSources(loadedDocs);
        if (!activeDocId || !loadedDocs.some(s => s.id === activeDocId)) {
          setActiveDocId(loadedDocs[0].id);
        }
      } else if (project.sources?.length) {
        setSources(project.sources);
        if (!activeDocId || !project.sources.some(s => s.id === activeDocId)) {
          setActiveDocId(project.sources[0].id);
        }
      } else {
        setSources([]);
        setActiveDocId(null);
      }
    }
    fetchProjectSources();
  }, [project.id]);

  // Load saved artifacts when active document changes
  useEffect(() => {
    if (!activeDocId) return;
    TABS.forEach(async tab => {
      const key = `${activeDocId}_${tab.id}`;
      if (!artifacts[key]) {
        const saved = await getArtifact(project.id, activeDocId, tab.id);
        if (saved) {
          setArtifacts(prev => ({ ...prev, [key]: saved }));
        }
      }
    });
  }, [activeDocId, project.id]);

  // Handle PDF upload
  async function handleFileUpload(files) {
    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfFiles.length) return;

    for (const file of pdfFiles) {
      setOcrState({ fileName: file.name, progress: 0, status: 'Reading PDF pages...' });

      try {
        const parsed = await parsePDFFile(file, (progress, status) => {
          setOcrState({ fileName: file.name, progress, status });
        });

        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newDoc = {
          id: docId,
          title: parsed.fileName,
          rawText: parsed.rawText,
          pages: parsed.numPages,
          words: parsed.wordCount,
          createdAt: new Date().toISOString(),
        };

        await saveDocument(project.id, newDoc);

        setSources(prev => {
          const updated = [...prev, newDoc];
          return updated;
        });
        setActiveDocId(docId);
      } catch (err) {
        alert(`Error parsing ${file.name}: ${err.message}`);
      } finally {
        setOcrState(null);
      }
    }
  }

  function handleFileInput(e) {
    if (e.target.files?.length) {
      handleFileUpload(e.target.files);
      e.target.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  async function handleDeleteSource(docId) {
    if (!window.confirm('Delete this source and all its generated artifacts?')) return;
    await deleteDocument(project.id, docId);
    await deleteArtifactsForDoc(project.id, docId);

    setSources(prev => {
      const updated = prev.filter(s => s.id !== docId);
      if (activeDocId === docId) {
        setActiveDocId(updated[0]?.id || null);
      }
      return updated;
    });

    // Clean artifacts state
    setArtifacts(prev => {
      const next = { ...prev };
      TABS.forEach(t => delete next[`${docId}_${t.id}`]);
      return next;
    });
  }

  function handleDocChange(docId) {
    setActiveDocId(docId);
  }

  function handleTabChange(tabId) {
    setActiveTab(tabId);
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
        content = `# Infographic Summary — ${activeDoc.title}\n\n## ${data.title}\n*${data.subtitle || ''}*\n\n` +
          `### Key Metrics\n` + (data.stats || []).map(s => `- **${s.label}**: ${s.value} (${s.desc || ''})`).join('\n') + '\n\n' +
          `### Core Sections\n` + (data.sections || []).map(s => `#### ${s.title}\n${s.summary}\n`).join('\n') + '\n' +
          (data.keyInsight ? `\n> **Core Takeaway:** ${data.keyInsight}\n` : '');
      }
      
      else if (tab === 'studyguide') {
        fileName = `${activeDoc.title.replace('.pdf', '')}_StudyGuide.md`;
        content = `# Study Guide & Quiz — ${activeDoc.title}\n\n## 🎴 Flashcards\n\n` +
          (data.flashcards || []).map(f => `**Q:** ${f.question}\n**A:** ${f.answer}\n*Category:* ${f.category}\n`).join('\n---\n\n') +
          `\n## 🧩 Quiz Questions\n\n` +
          (data.quiz || []).map((q, idx) => `### Q${idx + 1}: ${q.question}\n` + (q.options || []).map((o, oi) => `  ${String.fromCharCode(65 + oi)}) ${o}`).join('\n') + `\n*Correct Answer:* Option ${String.fromCharCode(65 + q.correctIndex)}\n*Explanation:* ${q.explanation}\n`).join('\n---\n\n');
      }
    }

    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
    // Case 1: No PDFs uploaded yet
    if (sources.length === 0) {
      return (
        <div className="ws-no-source">
          <div className="ws-no-source-card glass-panel">
            <div className="ws-no-source-icon">📄</div>
            <div className="ws-no-source-title">Upload a PDF to get started</div>
            <div className="ws-no-source-desc">
              Upload your research papers, textbooks, or documents to generate AI Audio Podcasts, 3D Video Presentations, Slides, Infographics, Study Guides, and interactive Chat.
            </div>
            <button
              className="btn-generate"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 14 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span>⬆</span> Upload PDF Document
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Supports PDF documents up to 50MB
            </div>
          </div>
        </div>
      );
    }

    // Case 2: PDFs uploaded, but no active doc selected
    if (!activeDoc) {
      return (
        <div className="ws-no-source">
          <div className="ws-no-source-card glass-panel">
            <div className="ws-no-source-icon">📂</div>
            <div className="ws-no-source-title">Select a Document Source</div>
            <div className="ws-no-source-desc">
              Choose a document below to view its insights and workspace tools.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
              {sources.map(src => (
                <div
                  key={src.id}
                  className="ws-source-item"
                  style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)' }}
                  onClick={() => setActiveDocId(src.id)}
                >
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{src.title.replace('.pdf', '')}</div>
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
              <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--border-med)', borderRadius: 'var(--radius-md)', margin: '4px 0' }}>
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
              <div className="ws-upload-zone-hint">Click or drag &amp; drop file</div>
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
