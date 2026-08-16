import { useState } from 'react';
import { DECK_THEMES } from '../utils/themes';

export default function SlideDeckViewer({ slides, activeTheme = 'clean_slate', onThemeChange }) {
  const [current, setCurrent] = useState(0);
  const [themeId, setThemeId] = useState(activeTheme);
  const [showNotes, setShowNotes] = useState(false);
  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];

  const currentTheme = DECK_THEMES[themeId] || DECK_THEMES.clean_slate;

  const handleSelectTheme = (tId) => {
    setThemeId(tId);
    if (onThemeChange) onThemeChange(tId);
  };

  if (!slide) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>No slides available.</div>;

  const isTitle = slide.type === 'title';

  return (
    <div className="deck-layout" style={{ background: currentTheme.bg }}>
      {/* Thumbnail Sidebar */}
      <div
        className="deck-sidebar"
        style={{
          background: currentTheme.cardBg,
          borderColor: currentTheme.border,
        }}
      >
        <div className="deck-sidebar-header" style={{ borderBottomColor: currentTheme.border }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: currentTheme.textMuted }}>
            {list.length} Slides
          </span>

          {/* Dedicated Deck Theme Switcher */}
          <select
            value={themeId}
            onChange={(e) => handleSelectTheme(e.target.value)}
            className="deck-theme-select"
            style={{
              borderColor: currentTheme.border,
              background: currentTheme.bg,
              color: currentTheme.textPrimary,
            }}
          >
            {Object.values(DECK_THEMES).map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="deck-thumb-list">
          {list.map((s, i) => (
            <div
              key={i}
              className={`deck-thumb${i === current ? ' active' : ''}`}
              style={{
                borderColor: i === current ? currentTheme.accent : currentTheme.border,
                background: i === current ? currentTheme.accentBadgeBg : 'transparent',
              }}
              onClick={() => setCurrent(i)}
            >
              <div className="deck-thumb-num" style={{ color: currentTheme.textMuted }}>Slide {i + 1}</div>
              <div className="deck-thumb-title" style={{ color: currentTheme.textPrimary }}>{s.title}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Slide Card Container */}
      <div className="deck-main">
        {/* Top Toolbar with Theme & Speaker Notes Toggle */}
        <div className="deck-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: currentTheme.textPrimary }}>
              {currentTheme.icon} {currentTheme.name}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 99,
                background: currentTheme.accentBadgeBg,
                color: currentTheme.accent,
                border: `1px solid ${currentTheme.accentBadgeBorder}`,
                textTransform: 'uppercase',
              }}
            >
              {currentTheme.badge}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Speaker Notes Toggle Button */}
            {slide.speakerNotes && (
              <button
                type="button"
                className={`deck-notes-toggle-btn${showNotes ? ' active' : ''}`}
                onClick={() => setShowNotes(prev => !prev)}
                title={showNotes ? 'Hide speaker notes' : 'Show speaker notes'}
                style={{
                  background: showNotes ? currentTheme.accentBadgeBg : currentTheme.cardBg,
                  color: showNotes ? currentTheme.accent : currentTheme.textMuted,
                  borderColor: showNotes ? currentTheme.accentBadgeBorder : currentTheme.border,
                }}
              >
                <span>💡</span> {showNotes ? 'Notes Visible' : 'Notes Hidden'}
              </button>
            )}

            <span style={{ fontSize: 12, fontWeight: 700, color: currentTheme.textMuted }}>
              {current + 1} of {list.length}
            </span>
          </div>
        </div>

        {/* Large Format Presentation Slide Card */}
        <div
          className={`deck-card${isTitle ? ' is-title' : ''}`}
          style={{
            background: currentTheme.cardBg,
            borderColor: currentTheme.border,
            boxShadow: currentTheme.cardShadow,
          }}
        >
          <div className="deck-card-content">
            <h1
              className="deck-title"
              style={{
                color: currentTheme.textPrimary,
                fontSize: isTitle ? '34px' : '28px',
              }}
            >
              {slide.title}
            </h1>

            {slide.subtitle && (
              <div
                className="deck-subtitle"
                style={{ color: currentTheme.textSecondary }}
              >
                {slide.subtitle}
              </div>
            )}

            <div
              className="deck-divider"
              style={{ background: `linear-gradient(90deg, ${currentTheme.accent}, transparent)` }}
            />

            {slide.bullets?.length > 0 && (
              <ul className="deck-bullets">
                {slide.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="deck-bullet-item"
                    style={{ color: currentTheme.textSecondary }}
                  >
                    <span
                      className="deck-bullet-bullet"
                      style={{ color: currentTheme.bulletColor || currentTheme.accent }}
                    >
                      •
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Toggleable Speaker Notes Drawer */}
            {showNotes && slide.speakerNotes && (
              <div
                className="deck-notes-drawer"
                style={{
                  background: currentTheme.notesBg,
                  borderColor: currentTheme.border,
                  color: currentTheme.textSecondary,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${currentTheme.border}` }}>
                  <span style={{ color: currentTheme.accent, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💡</span> Speaker Notes
                  </span>
                  <button
                    onClick={() => setShowNotes(false)}
                    style={{
                      background: 'none', border: 'none', color: currentTheme.textMuted,
                      cursor: 'pointer', fontSize: 13, padding: '2px 6px', borderRadius: 4,
                      fontWeight: 700,
                    }}
                    title="Hide notes"
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: currentTheme.textSecondary }}>
                  {slide.speakerNotes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="deck-nav">
          <button
            className="deck-nav-btn"
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            style={{
              background: currentTheme.cardBg,
              color: currentTheme.textPrimary,
              borderColor: currentTheme.border,
            }}
          >
            ← Previous
          </button>

          <div className="deck-dots">
            {list.map((_, idx) => (
              <button
                key={idx}
                className={`deck-dot${idx === current ? ' active' : ''}`}
                style={{
                  background: idx === current ? currentTheme.accent : currentTheme.border,
                }}
                onClick={() => setCurrent(idx)}
                title={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          <button
            className="deck-nav-btn"
            onClick={() => setCurrent(c => Math.min(list.length - 1, c + 1))}
            disabled={current === list.length - 1}
            style={{
              background: currentTheme.cardBg,
              color: currentTheme.textPrimary,
              borderColor: currentTheme.border,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
