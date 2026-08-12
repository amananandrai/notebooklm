import React, { useMemo, useState } from 'react';
import { ASPECT_RATIOS, buildVideoTimeline } from './timeline';

const API_BASE = window.location.origin.includes('5173') || window.location.origin.includes('localhost') ? 'http://127.0.0.1:8080/api' : '/api';

export default function HyperFramesStudio({ slides, script }) {
  const [template, setTemplate] = useState('document-summary');
  const [aspect, setAspect] = useState('landscape');
  const [showCaptions, setShowCaptions] = useState(true);
  const [status, setStatus] = useState('');
  const timeline = useMemo(() => buildVideoTimeline({ slides, script, aspect }), [slides, script, aspect]);
  const slide = timeline.slides[0];

  async function renderHyperFrames() {
    setStatus('Submitting HyperFrames HTML render…');
    try {
      const response = await fetch(`${API_BASE}/hyperframes/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template, timeline, showCaptions }) });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || errorBody.error || 'HyperFrames render failed.');
      }
      const result = await response.json();
      setStatus(result.message || 'HyperFrames render started.');
      if (result.status === 'complete' && result.downloadUrl) {
        setStatus(<span>HyperFrames render complete. <a href={result.downloadUrl} download style={{ color: 'var(--accent-lit)' }}>Download MP4</a></span>);
        return;
      }
      const poll = async () => {
        const statusResponse = await fetch(`${API_BASE}/hyperframes/render/${result.jobId}`);
        const renderStatus = await statusResponse.json();
        if (renderStatus.status === 'rendering') {
          window.setTimeout(poll, 1500);
        } else if (renderStatus.status === 'complete') {
          const baseUrl = API_BASE.replace('/api', '');
          setStatus(<span>HyperFrames render complete. <a href={`${baseUrl}${renderStatus.downloadUrl}`} download style={{ color: 'var(--accent-lit)' }}>Download MP4</a></span>);
        } else {
          setStatus(renderStatus.detail || renderStatus.message || 'HyperFrames render failed.');
        }
      };
      window.setTimeout(poll, 1500);
    } catch (error) {
      setStatus(error.message || 'HyperFrames render service is unavailable.');
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>HyperFrames Studio</strong>
      <select value={template} onChange={(event) => setTemplate(event.target.value)} style={{ padding: 7, background: 'var(--bg-active)', color: 'inherit', border: '1px solid var(--border-hi)', borderRadius: 7 }}><option value="document-summary">Document Summary</option><option value="explainer">Animated Explainer</option><option value="social-cards">Social Cards</option></select>
      <select value={aspect} onChange={(event) => setAspect(event.target.value)} style={{ padding: 7, background: 'var(--bg-active)', color: 'inherit', border: '1px solid var(--border-hi)', borderRadius: 7 }}>{Object.entries(ASPECT_RATIOS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
      <label style={{ fontSize: 12 }}><input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} /> Captions</label>
      <button onClick={renderHyperFrames} className="btn-generate" style={{ marginLeft: 'auto' }}>Render HTML → MP4</button>
    </div>
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(900px, 100%)', aspectRatio: `${timeline.width}/${timeline.height}`, background: 'linear-gradient(135deg,#111b38,#5b3b94)', borderRadius: 18, padding: '8%', boxSizing: 'border-box', boxShadow: '0 20px 60px #0008', fontFamily: 'Inter, Arial, sans-serif' }}>
        <div style={{ color: '#bdaeff', fontSize: 14, fontWeight: 800, letterSpacing: 2 }}>HYPERFRAMES TEMPLATE · {template.toUpperCase()}</div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 70px)', lineHeight: 1.05, margin: '26px 0' }}>{slide?.title || 'Document Summary'}</h1>
        <div style={{ fontSize: 'clamp(16px, 2vw, 30px)', lineHeight: 1.45 }}>{(slide?.bullets || []).slice(0, 4).map((bullet, index) => <div key={index} style={{ marginBottom: 12 }}>✦ {bullet}</div>)}</div>
        {showCaptions && timeline.turns[0] && <div style={{ marginTop: 30, padding: '14px 18px', borderRadius: 12, background: '#090a12dd', border: '1px solid #c4b5fd88', fontStyle: 'italic' }}>{timeline.turns[0].text}</div>}
      </div>
    </div>
    {status && <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>{status}</div>}
  </div>;
}
