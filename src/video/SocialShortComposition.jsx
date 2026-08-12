import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import DocumentSummaryComposition from './DocumentSummaryComposition';

export default function SocialShortComposition(props) {
  return <AbsoluteFill style={{ background: '#080a12' }}>
    <DocumentSummaryComposition {...props} />
    <div style={{ position: 'absolute', top: 46, left: 42, right: 42, display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 22, fontWeight: 800 }}>
      <span>NOTEBOOKLM</span><span>●</span>
    </div>
  </AbsoluteFill>;
}
