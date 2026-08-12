import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { activeTurnAtFrame } from './timeline';

export default function CaptionOverlay({ timeline, theme = 'podcast', position = 'bottom' }) {
  const frame = useCurrentFrame();
  const turn = activeTurnAtFrame(timeline, frame);
  if (!turn || !turn.text) return null;

  const isAlex = /alex|host a/i.test(turn.speaker);
  const accent = isAlex ? '#a594f2' : '#f9a8d4';
  const positionStyle = position === 'top' ? { top: 58 } : position === 'center' ? { top: '42%' } : { bottom: 58 };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', justifyContent: 'center', alignItems: 'center', ...positionStyle }}>
      <div style={{
        width: '84%', boxSizing: 'border-box', padding: '20px 28px', borderRadius: 20,
        background: 'rgba(8, 10, 18, 0.92)', border: `2px solid ${accent}99`,
        boxShadow: '0 14px 45px rgba(0,0,0,.42)', color: '#fff', fontFamily: 'Inter, Arial, sans-serif',
      }}>
        <div style={{ color: accent, fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>
          {turn.speaker.toUpperCase()}
        </div>
        <div style={{ fontSize: 28, lineHeight: 1.25, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
          {turn.text}
        </div>
      </div>
    </AbsoluteFill>
  );
}
