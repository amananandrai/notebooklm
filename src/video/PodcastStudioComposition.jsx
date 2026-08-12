import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import CaptionOverlay from './CaptionOverlay';
import { activeSlideAtFrame, activeTurnAtFrame } from './timeline';

function Host({ side, active }) {
  return <div style={{ position: 'absolute', bottom: '24%', [side]: '10%', width: '24%', height: '42%' }}>
    <div style={{ position: 'absolute', bottom: 0, left: '20%', width: '60%', height: '54%', borderRadius: '48% 48% 18% 18%', background: side === 'left' ? 'linear-gradient(135deg,#1d2747,#6876c8)' : 'linear-gradient(135deg,#401f4c,#d66b9d)', transform: active ? 'translateY(-8px) scale(1.02)' : 'none', transition: 'transform .1s' }} />
    <div style={{ position: 'absolute', top: 0, left: '30%', width: '40%', height: '38%', borderRadius: '50%', background: '#d9a27d', boxShadow: '0 -12px 0 8px #15151f' }} />
    <div style={{ position: 'absolute', top: '38%', left: '48%', width: '12%', height: '34%', background: '#d9a27d', borderRadius: 20, transform: side === 'left' ? 'rotate(-52deg)' : 'rotate(52deg)', transformOrigin: 'top' }} />
  </div>;
}

export default function PodcastStudioComposition({ timeline, audioSrc, showCaptions = true }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const turn = activeTurnAtFrame(timeline, frame);
  const slide = activeSlideAtFrame(timeline, frame);
  const isAlex = turn && /alex|host a/i.test(turn.speaker);

  return <AbsoluteFill style={{ background: 'linear-gradient(#080b12,#171018)', color: '#fff', fontFamily: 'Inter, Arial, sans-serif', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: '7% 9% 34%', background: '#16433f', border: '18px solid #3b2718', boxShadow: '0 0 0 6px #87633e inset', padding: '4% 5%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: Math.max(26, width * 0.018), fontWeight: 800, color: '#e5f0dc', borderBottom: '3px solid #b7d6bf', paddingBottom: 18 }}>
        {slide?.title || 'NotebookLM Video Studio'}
      </div>
      <div style={{ marginTop: 28, fontSize: Math.max(18, width * 0.011), lineHeight: 1.6, color: '#d8e9d9' }}>
        {(slide?.bullets || []).slice(0, 5).map((bullet, index) => <div key={index}>• {bullet}</div>)}
      </div>
    </div>
    <Host side="left" active={Boolean(isAlex)} />
    <Host side="right" active={Boolean(turn && !isAlex)} />
    <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '23%', height: '10%', background: '#201b1b', borderTop: '10px solid #5b4538', borderRadius: 8 }} />
    <div style={{ position: 'absolute', left: '24%', right: '24%', bottom: '12%', height: '11%', background: '#09090d', borderRadius: '0 0 24px 24px' }} />
    <div style={{ position: 'absolute', left: '27%', bottom: '26%', width: 18, height: '14%', background: '#b8c2d6', transform: 'rotate(22deg)', transformOrigin: 'bottom', borderRadius: 10 }} />
    <div style={{ position: 'absolute', right: '27%', bottom: '26%', width: 18, height: '14%', background: '#b8c2d6', transform: 'rotate(-22deg)', transformOrigin: 'bottom', borderRadius: 10 }} />
    {audioSrc && <Sequence from={0}><Audio src={audioSrc} /></Sequence>}
    {showCaptions && <CaptionOverlay timeline={timeline} theme="podcast" />}
  </AbsoluteFill>;
}
