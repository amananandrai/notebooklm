import React from 'react';
import { 
  Network, 
  Headphones, 
  Presentation, 
  BookOpenCheck, 
  MessageSquare, 
  Sparkles,
  ArrowRight,
  Zap,
  CheckCircle2
} from 'lucide-react';

export default function StudioOverview({ activeDoc, onSelectTab }) {
  const cards = [
    {
      id: 'mindmap',
      title: 'Interactive Mind Map',
      badge: 'Visual Hierarchy',
      icon: Network,
      color: 'var(--accent-indigo)',
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.1))',
      description: 'Auto-generates visual node trees of core themes, subtopics, and empirical data extracted from the PDF.',
      stats: 'Interactive SVG • Zoom/Pan'
    },
    {
      id: 'audio',
      title: 'Audio Overview Podcast',
      badge: 'AI Dialog Synthesis',
      icon: Headphones,
      color: 'var(--accent-cyan)',
      gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.1))',
      description: 'Multi-speaker podcast (Host A & Host B) synthesizing key takeaways with animated waveform & Web Speech TTS.',
      stats: 'Speech Synthesis • Waveform'
    },
    {
      id: 'slides',
      title: 'Slide Deck Generator',
      badge: 'Executive Brief',
      icon: Presentation,
      color: 'var(--accent-violet)',
      gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.1))',
      description: 'Converts document structure into executive presentation slides with speaker notes and presentation mode.',
      stats: 'Presentation Mode • Speaker Notes'
    },
    {
      id: 'study',
      title: 'Study Guide & Flashcards',
      badge: 'Interactive Learning',
      icon: BookOpenCheck,
      color: 'var(--accent-amber)',
      gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.1))',
      description: 'Summary cheat sheet, 3D flip flashcards deck with mastery tracking, and instant-scoring self quizzes.',
      stats: '3D Flip Deck • Quiz Engine'
    },
    {
      id: 'chat',
      title: 'Interactive PDF Assistant',
      badge: 'Q&A Citations',
      icon: MessageSquare,
      color: 'var(--accent-emerald)',
      gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.1))',
      description: 'Chat assistant grounded directly in the PDF data with page citations, prompt suggestions, and text lookup.',
      stats: 'Page Citations • Fast Index'
    }
  ];

  return (
    <div className="animate-fade-in" style={{ padding: '28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Hero Banner */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '28px', background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.9), rgba(30, 41, 68, 0.95))', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '14px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <Zap style={{ width: '14px', height: '14px' }} /> NotebookLM MCP Studio Engine
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
            Document Grounded Intelligence Studio
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', maxWidth: '720px', lineHeight: 1.6 }}>
            Active Source: <strong style={{ color: '#fff' }}>{activeDoc ? activeDoc.title : 'No document selected'}</strong>. Select any NotebookLM artifact below to visualize, listen, study, or interact with your PDF data.
          </p>
        </div>
      </div>

      {/* Grid of MCP Artifact Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {cards.map((card) => {
          const IconComp = card.icon;
          return (
            <div
              key={card.id}
              onClick={() => onSelectTab(card.id)}
              className="glass-panel"
              style={{
                padding: '24px',
                cursor: 'pointer',
                background: card.gradient,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '240px',
                transition: 'all 0.25s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(15, 21, 36, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <IconComp style={{ width: '22px', height: '22px', color: card.color }} />
                  </div>
                  <span className="badge badge-indigo">{card.badge}</span>
                </div>

                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {card.description}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px', marginTop: '14px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                  {card.stats}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600, color: card.color }}>
                  Launch <ArrowRight style={{ width: '14px', height: '14px' }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
