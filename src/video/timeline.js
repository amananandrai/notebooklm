export const VIDEO_FPS = 30;

export const ASPECT_RATIOS = {
  landscape: { width: 1920, height: 1080, label: 'Landscape 16:9' },
  portrait: { width: 1080, height: 1920, label: 'Vertical 9:16' },
  square: { width: 1080, height: 1080, label: 'Square 1:1' },
};

export function normalizeTurns(script = []) {
  return (Array.isArray(script) ? script : []).map((turn, index) => ({
    id: turn.id || `turn-${index}`,
    speaker: turn.speaker || 'Host',
    text: String(turn.text || '').trim(),
    durationSeconds: Number(turn.durationSeconds || Math.max(3, String(turn.text || '').trim().split(/\s+/).length / 2.5)),
  }));
}

export function buildVideoTimeline({ slides = [], script = [], aspect = 'landscape', fps = VIDEO_FPS } = {}) {
  const turns = normalizeTurns(script);
  let cursor = 0;
  const timelineTurns = turns.map((turn) => {
    const durationInFrames = Math.max(1, Math.ceil(turn.durationSeconds * fps));
    const item = { ...turn, startFrame: cursor, durationInFrames };
    cursor += durationInFrames + Math.ceil(fps * 0.5);
    return item;
  });

  const safeSlides = Array.isArray(slides) ? slides : [];
  const slidesPerTurn = Math.max(1, Math.ceil(timelineTurns.length / Math.max(1, safeSlides.length)));
  const timelineSlides = safeSlides.map((slide, index) => ({
    ...slide,
    index,
    startFrame: timelineTurns[index * slidesPerTurn]?.startFrame || 0,
    endFrame: timelineTurns[Math.min(timelineTurns.length - 1, ((index + 1) * slidesPerTurn) - 1)]
      ? timelineTurns[Math.min(timelineTurns.length - 1, ((index + 1) * slidesPerTurn) - 1)].startFrame + timelineTurns[Math.min(timelineTurns.length - 1, ((index + 1) * slidesPerTurn) - 1)].durationInFrames
      : cursor,
  }));

  return {
    fps,
    aspect,
    ...ASPECT_RATIOS[aspect],
    durationInFrames: Math.max(fps, cursor),
    turns: timelineTurns,
    slides: timelineSlides,
  };
}

export function activeTurnAtFrame(timeline, frame) {
  return timeline?.turns?.find((turn) => frame >= turn.startFrame && frame < turn.startFrame + turn.durationInFrames) || null;
}

export function activeSlideAtFrame(timeline, frame) {
  return timeline?.slides?.find((slide) => frame >= slide.startFrame && frame < slide.endFrame)
    || timeline?.slides?.[timeline.slides.length - 1]
    || null;
}
