import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, interpolate } from 'remotion';
import CaptionOverlay from './CaptionOverlay';
import { activeSlideAtFrame } from './timeline';

export default function DocumentSummaryComposition({ timeline, audioSrc, showCaptions = true }) {
  const frame = useCurrentFrame();
  const slide = activeSlideAtFrame(timeline, frame);
  const opacity = interpolate(frame - (slide?.startFrame || 0), [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: 'linear-gradient(135deg,#10172d,#31245b)', color: '#fff', padding: '8%', fontFamily: 'Inter, Arial, sans-serif', opacity }}>
    <div style={{ fontSize: 68, fontWeight: 850, maxWidth: '86%' }}>{slide?.title || 'Document Summary'}</div>
    <div style={{ width: '22%', height: 8, background: '#a594f2', margin: '28px 0 42px' }} />
    <div style={{ fontSize: 32, lineHeight: 1.55, maxWidth: '82%' }}>{(slide?.bullets || []).map((bullet, index) => <div key={index} style={{ marginBottom: 18 }}>• {bullet}</div>)}</div>
    {audioSrc && <Sequence from={0}><Audio src={audioSrc} /></Sequence>}
    {showCaptions && <CaptionOverlay timeline={timeline} theme="summary" />}
  </AbsoluteFill>;
}
