import { useState } from 'react';
import { SLIDE_THEMES } from '../utils/themes';

export default function SlideDeckViewer({ slides, activeTheme = 'light_slate', onThemeChange }) {
  const [current, setCurrent] = useState(0);
  const [themeId, setThemeId] = useState(activeTheme);
  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];

  const currentTheme = SLIDE_THEMES[themeId] || SLIDE_THEMES.light_slate;

  const handleSelectTheme = (tId) => {
    setThemeId(tId);
    if (onThemeChange) onThemeChange(tId);
  };

  if (!slide) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>No slides available.</div>;

  const isTitle = slide.type === 'title';

  return (
    <div className="slides-layout" style={{ background: currentTheme.bg }}>
      {/* Thumbnail sidebar */}
      <div
        className="slides-sidebar"
        style={{
          background: currentTheme.cardBg,
          borderColor: currentTheme.border,
          color: currentTheme.textPrimary,
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${currentTheme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: currentTheme.textMuted }}>
            {list.length} Slides
          </span>
          {/* Live Theme Picker */}
          <select
            value={themeId}
            onChange={(e) => handleSelectTheme(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${currentTheme.border}`,
              background: currentTheme.bg,
              color: currentTheme.textPrimary,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {Object.values(SLIDE_THEMES).map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((s, i) => (
            <div
              key={i}
              className={`slide-thumb${i === current ? ' active' : ''}`}
              style={{
                borderColor: i === current ? currentTheme.accent : currentTheme.border,
                background: i === current ? currentTheme.accentBadgeBg : 'transparent',
                color: i === current ? currentTheme.accent : currentTheme.textPrimary,
              }}
              onClick={() => setCurrent(i)}
            >
              <div className="slide-thumb-num" style={{ color: currentTheme.textMuted }}>Slide {i + 1}</div>
              <div className="slide-thumb-title" style={{ color: currentTheme.textPrimary }}>{s.title}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide main canvas */}
      <div className="slide-main" style={{ background: currentTheme.bg }}>
        <div
          className={`slide-card${isTitle ? ' title-slide' : ''}`}
          style={{
            width: '100%',
            maxWidth: 760,
            background: currentTheme.cardBg,
            borderColor: currentTheme.border,
            boxShadow: `0 8px 32px ${currentTheme.accent}15`,
          }}
        >
          <div className="slide-card-inner">
            <div
              className="slide-number"
              style={{
                background: currentTheme.accentBadgeBg,
                color: currentTheme.accent,
                borderColor: currentTheme.accentBadgeBorder,
              }}
            >
              Slide {current + 1} of {list.length}
            </div>

            <div
              className="slide-title-text"
              style={{ color: currentTheme.textPrimary }}
            >
              {slide.title}
            </div>

            {slide.subtitle && (
              <div
                className="slide-subtitle-text"
                style={{ color: currentTheme.textSecondary }}
              >
                {slide.subtitle}
              </div>
            )}

            <div
              className="slide-divider"
              style={{ background: `linear-gradient(90deg, ${currentTheme.accent}, transparent)` }}
            />

            {slide.bullets?.length > 0 && (
              <ul className="slide-bullets">
                {slide.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="slide-bullet"
                    style={{ color: currentTheme.textSecondary }}
                  >
                    <span style={{ color: currentTheme.accent, marginRight: 8, fontWeight: 700 }}>•</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {slide.speakerNotes && (
              <div
                className="slide-notes"
                style={{
                  background: currentTheme.bg,
                  borderColor: currentTheme.border,
                  color: currentTheme.textMuted,
                }}
              >
                <strong style={{ color: currentTheme.accent }}>Speaker Notes:</strong> {slide.speakerNotes}
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
          <span className="slides-counter" style={{ color: currentTheme.textMuted }}>
            {current + 1} / {list.length}
          </span>
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
