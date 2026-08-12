import React, { useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import PodcastStudioComposition from './PodcastStudioComposition';
import DocumentSummaryComposition from './DocumentSummaryComposition';
import SocialShortComposition from './SocialShortComposition';
import { ASPECT_RATIOS, buildVideoTimeline } from './timeline';

const API_BASE = window.location.origin.includes('5173') || window.location.origin.includes('localhost') ? 'http://127.0.0.1:8080/api' : '/api';

export default function VideoExportStudio({ slides, script }) {
  const [composition, setComposition] = useState('podcast');
  const [aspect, setAspect] = useState('landscape');
  const [showCaptions, setShowCaptions] = useState(true);
  const [renderState, setRenderState] = useState({ status: 'idle', message: '' });
  const timeline = useMemo(() => buildVideoTimeline({ slides, script, aspect }), [slides, script, aspect]);
  const Component = composition === 'podcast' ? PodcastStudioComposition : composition === 'social' ? SocialShortComposition : DocumentSummaryComposition;

  async function renderVideo() {
    setRenderState({ status: 'rendering', message: 'Submitting deterministic render…' });
    try {
      const response = await fetch(`${API_BASE}/videos/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ composition, timeline, showCaptions }) });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setRenderState({ status: 'rendering', message: result.message || 'Rendering MP4…', jobId: result.jobId });
      const poll = async () => {
        const statusResponse = await fetch(`${API_BASE}/videos/render/${result.jobId}`);
        const status = await statusResponse.json();
        if (status.status === 'rendering') {
          window.setTimeout(poll, 1500);
        } else if (status.status === 'complete') {
          setRenderState({ status: 'complete', message: 'MP4 render complete.', jobId: result.jobId, downloadUrl: `${API_BASE.replace('/api', '')}${status.downloadUrl}` });
        } else {
          setRenderState({ status: 'error', message: status.message || 'Remotion render failed.' });
        }
      };
      window.setTimeout(poll, 1500);
    } catch (error) {
      setRenderState({ status: 'error', message: error.message || 'Render service is unavailable.' });
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
    <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <strong>Remotion Export</strong>
      {['podcast', 'summary', 'social'].map((item) => <button key={item} onClick={() => setComposition(item)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border-hi)', background: composition === item ? 'var(--accent)' : 'var(--bg-active)', color: '#fff', cursor: 'pointer' }}>{item === 'podcast' ? 'Podcast Studio' : item === 'summary' ? 'Document Summary' : 'Social Short'}</button>)}
      <select value={aspect} onChange={(event) => setAspect(event.target.value)} style={{ marginLeft: 'auto', padding: 7, background: 'var(--bg-active)', color: 'inherit', border: '1px solid var(--border-hi)', borderRadius: 7 }}>{Object.entries(ASPECT_RATIOS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
      <label style={{ fontSize: 12 }}><input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} /> Captions</label>
      <button onClick={renderVideo} disabled={renderState.status === 'rendering'} className="btn-generate">Render MP4</button>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 20 }}>
      <Player component={Component} inputProps={{ timeline, showCaptions }} durationInFrames={timeline.durationInFrames} compositionWidth={timeline.width} compositionHeight={timeline.height} fps={timeline.fps} controls style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: `${timeline.width}/${timeline.height}`, background: '#080a12' }} />
    </div>
    {renderState.message && <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', color: renderState.status === 'error' ? '#fecaca' : 'var(--text-muted)' }}>{renderState.message} {renderState.downloadUrl && <a href={renderState.downloadUrl} download style={{ color: 'var(--accent-lit)' }}>Download MP4</a>}</div>}
  </div>;
}
