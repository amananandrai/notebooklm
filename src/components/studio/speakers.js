// ================================================================
// SPEAKER IDENTITY
// One definition of who is speaking and which colour represents them,
// shared by captions, the mic activity rings and the shot planner.
// ================================================================

export const SPEAKER_COLORS = {
  a: '#7c6cf6',
  b: '#ec4899'
};

export function isHostA(speaker) {
  const name = String(speaker || '').toLowerCase();
  return name.includes('host a') || name.includes('alex');
}

export function speakerKey(speaker) {
  return isHostA(speaker) ? 'a' : 'b';
}

export function speakerColor(speaker) {
  return SPEAKER_COLORS[speakerKey(speaker)];
}
