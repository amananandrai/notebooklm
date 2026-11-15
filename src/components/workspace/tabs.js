/** Workspace tabs and their empty-state copy. */
// ── Tab configuration ──────────────────────────────────────────
export const TABS = [
  { id: 'mindmap',     label: 'Mind Map',     icon: '🧠' },
  { id: 'audio',       label: 'Audio',        icon: '🎙️' },
  { id: 'slides',      label: 'Slides',       icon: '📊' },
  { id: 'slides_img',  label: 'Slides + Images', icon: '🖼️' },
  { id: 'infographic', label: 'Infographic',  icon: '📈' },
  { id: 'report',      label: 'Report',       icon: '📄' },
  { id: 'datatable',   label: 'Data Table',   icon: '📋' },
  { id: 'video',       label: 'Video Studio', icon: '🎬' },
  { id: 'studyguide',  label: 'Study Guide',  icon: '📕' },
  { id: 'synthesis',   label: 'Synthesis',    icon: '🔗' },
  { id: 'chat',        label: 'Chat',         icon: '💬' },
];

export const TAB_META = {
  mindmap:     { title: 'Mind Map',     icon: '🧠', desc: 'Visual concept hierarchy of key ideas and their relationships.', feats: ['Interactive node tree', 'Category coloring', 'Expand/collapse branches'] },
  audio:       { title: 'Audio Podcast', icon: '🎙️', desc: 'Two AI hosts discussing your document in an engaging conversation.', feats: ['Alex & Jordan hosts', 'Natural voice synthesis', 'Interactive transcript'] },
  slides:      { title: 'Slide Deck',   icon: '📊', desc: 'Presentation slides with key points and speaker notes.', feats: ['Title & content slides', 'Speaker notes included', 'Export ready format'] },
  slides_img:  { title: 'Slides + Images', icon: '🖼️', desc: 'Presentation slides enhanced with AI-generated visual illustrations.', feats: ['Flux Realism generated visuals', 'High-res image backgrounds', 'PDF & PPTX exports'] },
  infographic: { title: 'Infographic',  icon: '📈', desc: 'Visual data summary with key metrics, timeline, and core takeaways.', feats: ['Metrics grid', 'Core sections cards', 'Timeline flow'] },
  report:      { title: 'Executive Report', icon: '📄', desc: 'Comprehensive executive report with key findings, risks, and recommendations.', feats: ['Executive summary', 'Risk analysis matrix', 'Strategic recommendations'] },
  datatable:   { title: 'Data Table',   icon: '📋', desc: 'Structured tabular data extracted from your document for easy comparison.', feats: ['Sortable columns', 'Search & filter', 'CSV export'] },
  video:       { title: '3D Video Studio', icon: '🎬', desc: 'Interactive 3D presentation studio with AI hosts and blackboard.', feats: ['Interactive 3D avatars', 'Blackboard sync', 'Live presentation recording'] },
  studyguide:  { title: 'Study Guide',  icon: '📕', desc: 'Flashcards and quiz questions to master your document content.', feats: ['3D Flip Flashcards', 'Practice Quiz', 'Mastery tracking'] },
  synthesis:   { title: 'Cross-Doc Synthesis', icon: '🔗', desc: 'Analyze all uploaded sources together to find shared themes, contradictions, and unified insights.', feats: ['Common theme detection', 'Contradiction analysis', 'Unified recommendations'] },
  chat:        { title: 'Chat Assistant', icon: '💬', desc: 'Ask questions and chat with the AI about your document.', feats: ['Strict document grounding', 'Source citations', 'Download chat log'] },
};

export function cleanTitle(val) {
  if (!val) return 'Document';
  if (typeof val === 'object') return (val.title || val.name || 'Document').replace(/\.pdf$/i, '');
  return String(val).replace(/\.pdf$/i, '');
}
