import React, { useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import PodcastStudioComposition from './PodcastStudioComposition';
import DocumentSummaryComposition from './DocumentSummaryComposition';
import SocialShortComposition from './SocialShortComposition';
import { ASPECT_RATIOS, buildVideoTimeline } from './timeline';

import { API_BASE, apiFetch, downloadAuthed } from '../utils/api';

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
      const response = await apiFetch(`${API_BASE}/videos/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ composition, timeline, showCaptions }) });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setRenderState({ status: 'rendering', message: result.message || 'Rendering MP4…', jobId: result.jobId });
      const poll = async () => {
        let status;
        try {
          const statusResponse = await apiFetch(`${API_BASE}/videos/render/${result.jobId}`);
          status = await statusResponse.json();
        } catch (error) {
          setRenderState({ status: 'error', message: error.message || 'Lost connection to the render service.' });
          return;
        }
        if (status.status === 'rendering') {
          window.setTimeout(poll, 1500);
        } else if (status.status === 'complete') {
          setRenderState({ status: 'complete', message: 'MP4 render complete.', jobId: result.jobId, downloadPath: status.downloadUrl });
        } else {
          setRenderState({ status: 'error', message: [status.message || 'Remotion render failed.', status.log?.split('\n').pop()].filter(Boolean).join(' — ') });
        }
      };
      window.setTimeout(poll, 1500);
    } catch (error) {
      setRenderState({ status: 'error', message: error.message || 'Render service is unavailable.' });
    }
  }

  return <div className="video-export-root">
    <div className="video-export-toolbar">
      <div className="video-export-modes" role="tablist" aria-label="Video composition">
        {['podcast', 'summary', 'social'].map((item) => <button className={composition === item ? 'video-export-mode active' : 'video-export-mode'} key={item} onClick={() => setComposition(item)} role="tab" aria-selected={composition === item}>{item === 'podcast' ? 'Podcast' : item === 'summary' ? 'Summary' : 'Social Short'}</button>)}
      </div>
      <div className="video-export-settings">
        <label className="video-export-select-label">Format<select value={aspect} onChange={(event) => setAspect(event.target.value)}>{Object.entries(ASPECT_RATIOS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label className="video-export-caption-toggle"><input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} /> Captions</label>
        <button onClick={renderVideo} disabled={renderState.status === 'rendering'} className="btn-generate video-export-button">{renderState.status === 'rendering' ? 'Rendering…' : 'Render MP4'}</button>
      </div>
    </div>
    <div className="video-export-preview">
      <Player component={Component} inputProps={{ timeline, showCaptions }} durationInFrames={timeline.durationInFrames} compositionWidth={timeline.width} compositionHeight={timeline.height} fps={timeline.fps} controls style={{ width: 'min(100%, 720px)', maxHeight: '100%', aspectRatio: `${timeline.width}/${timeline.height}`, background: '#080a12', border: '1px solid var(--border-med)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }} />
    </div>
    {renderState.message && <div className={`video-export-status ${renderState.status === 'error' ? 'error' : ''}`}>{renderState.message} {renderState.downloadPath && <button type="button" className="btn-generate" onClick={() => downloadAuthed(renderState.downloadPath, 'notebooklm_video.mp4').catch(e => setRenderState(prev => ({ ...prev, message: e.message })))}>Download MP4</button>}</div>}
  </div>;
}
