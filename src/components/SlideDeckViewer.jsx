import { useState } from 'react';

export default function SlideDeckViewer({ slides }) {
  const [current, setCurrent] = useState(0);
  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];

  if (!slide) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>No slides available.</div>;

  const isTitle   = slide.type === 'title';
  const isSummary = slide.type === 'summary';

  return (
    <div className="slides-layout">
      {/* Thumbnail sidebar */}
      <div className="slides-sidebar">
        {list.map((s, i) => (
          <div
            key={i}
            className={`slide-thumb${i === current ? ' active' : ''}`}
            onClick={() => setCurrent(i)}
          >
            <div className="slide-thumb-num">Slide {i + 1}</div>
            <div className="slide-thumb-title">{s.title}</div>
          </div>
        ))}
      </div>

      {/* Slide area */}
      <div className="slide-main">
        <div className={`slide-card${isTitle ? ' title-slide' : ''}`} style={{ width: '100%', maxWidth: 720 }}>
          <div className="slide-card-inner">
            <div className="slide-number">Slide {current + 1} of {list.length}</div>
            <div className="slide-title-text">{slide.title}</div>
            {slide.subtitle && (
              <div className="slide-subtitle-text">{slide.subtitle}</div>
            )}
            <div className="slide-divider" />

            {slide.bullets?.length > 0 && (
              <ul className="slide-bullets">
                {slide.bullets.map((b, i) => (
                  <li key={i} className="slide-bullet">{b}</li>
                ))}
              </ul>
            )}

            {slide.speakerNotes && (
              <div className="slide-notes">
                <strong>Speaker Notes:</strong> {slide.speakerNotes}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="slides-nav">
          <button
            className="slides-nav-btn"
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
          >
            ← Prev
          </button>
          <span className="slides-counter">{current + 1} / {list.length}</span>
          <button
            className="slides-nav-btn"
            onClick={() => setCurrent(c => Math.min(list.length - 1, c + 1))}
            disabled={current === list.length - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
