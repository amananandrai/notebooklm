import { useState } from 'react';
import { DECK_THEMES } from '../utils/themes';
import DeckBackground, { getThemeSvgString } from './DeckBackground';

function hexToRgb(hex) {
  if (!hex) return [0,0,0];
  const c = hex.replace('#', '');
  return [parseInt(c.substring(0,2), 16) || 0, parseInt(c.substring(2,4), 16) || 0, parseInt(c.substring(4,6), 16) || 0];
}

async function svgToPngDataUrl(svgString, width = 1440, height = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png', 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function downloadPDF(slides, docTitle, activeTheme) {
  const theme = DECK_THEMES[activeTheme] || DECK_THEMES.clean_slate;
  const { jsPDF } = await import('jspdf');
  const W = 297, H = 167.0625; 
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });

  const bgRgb = hexToRgb(theme.bg);
  const cardRgb = hexToRgb(theme.cardBg);
  const textPrimaryRgb = hexToRgb(theme.textPrimary);
  const textSecondaryRgb = hexToRgb(theme.textSecondary);
  const accentRgb = hexToRgb(theme.accent);

  const rawSvg = getThemeSvgString(activeTheme);
  const bgPng = await svgToPngDataUrl(rawSvg, 1440, 800);

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (i > 0) pdf.addPage([W, H], 'landscape');

    if (bgPng) {
      pdf.addImage(bgPng, 'PNG', 0, 0, W, H);
    } else {
      pdf.setFillColor(...bgRgb);
      pdf.rect(0, 0, W, H, 'F');
    }

    if (slide.type === 'title') {
      pdf.setDrawColor(...accentRgb);
      pdf.setLineWidth(1.5);
      pdf.line(15, 15, W - 15, 15);
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(slide.type === 'title' ? 24 : 20);
    pdf.setTextColor(...textPrimaryRgb);
    const titleLines = pdf.splitTextToSize(slide.title || '', W - 50);
    pdf.text(titleLines, 25, 35);

    let currentY = 35 + titleLines.length * 10;
    
    if (slide.subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(14);
      pdf.setTextColor(...textSecondaryRgb);
      pdf.text(slide.subtitle, 25, currentY);
      currentY += 15;
    } else {
      currentY += 5;
    }

    if (slide.bullets?.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(...textSecondaryRgb);
      slide.bullets.forEach((b) => {
        const lines = pdf.splitTextToSize(`• ${b}`, W - 50);
        pdf.text(lines, 30, currentY);
        currentY += lines.length * 7;
      });
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...hexToRgb(theme.textMuted));
    pdf.text(`${i + 1} / ${slides.length}`, W - 20, H - 20, { align: 'right' });
  }

  pdf.save(`${docTitle || 'Slides'}.pdf`);
}

async function downloadPPTX(slides, docTitle, activeTheme) {
  const theme = DECK_THEMES[activeTheme] || DECK_THEMES.clean_slate;
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE';

  const bgHex = theme.bg.replace('#', '');
  const cardHex = theme.cardBg.replace('#', '');
  const textPrimaryHex = theme.textPrimary.replace('#', '');
  const textSecondaryHex = theme.textSecondary.replace('#', '');
  const accentHex = theme.accent.replace('#', '');

  const rawSvg = getThemeSvgString(activeTheme);
  const bgPng = await svgToPngDataUrl(rawSvg, 1440, 800);

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const sld = prs.addSlide();
    
    if (bgPng) {
      sld.background = { data: bgPng };
    } else {
      sld.background = { color: bgHex };
    }

    sld.addText(`Slide ${i + 1} · ${theme.name}`, {
      x: 1.0, y: 0.8, w: 5.0, h: 0.4,
      fontSize: 10, bold: true, color: theme.textMuted.replace('#', ''), fontFace: 'Helvetica',
    });

    sld.addText(slide.title, {
      x: 1.0, y: 1.2, w: 11.3, h: 1.0,
      fontSize: slide.type === 'title' ? 32 : 26,
      bold: true, color: textPrimaryHex, fontFace: 'Helvetica',
    });

    if (slide.subtitle) {
      sld.addText(slide.subtitle, {
        x: 1.0, y: 2.1, w: 11.3, h: 0.5,
        fontSize: 16, color: textSecondaryHex, fontFace: 'Helvetica',
      });
    }

    if (slide.bullets && slide.bullets.length > 0) {
      const bulletItems = slide.bullets.map(b => ({
        text: b,
        options: { fontSize: 14, color: textSecondaryHex, bullet: { color: accentHex }, spaceAfter: 10, fontFace: 'Helvetica' },
      }));
      sld.addText(bulletItems, {
        x: 1.0, y: slide.subtitle ? 2.7 : 2.2, w: 11.3, h: 3.5,
      });
    }
  }

  await prs.writeFile({ fileName: `${docTitle || 'Slides'}.pptx` });
}

export default function SlideDeckViewer({ slides, docTitle, activeTheme = 'clean_slate', onThemeChange }) {
  const [current, setCurrent] = useState(0);
  const [themeId, setThemeId] = useState(activeTheme);
  const [showNotes, setShowNotes] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingPPTX, setIsExportingPPTX] = useState(false);
  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];

  const currentTheme = DECK_THEMES[themeId] || DECK_THEMES.clean_slate;

  const handleSelectTheme = (tId) => {
    setThemeId(tId);
    if (onThemeChange) onThemeChange(tId);
  };

  if (!slide) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>No slides available.</div>;

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      await downloadPDF(list, docTitle, themeId);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportPPTX = async () => {
    setIsExportingPPTX(true);
    try {
      await downloadPPTX(list, docTitle, themeId);
    } finally {
      setIsExportingPPTX(false);
    }
  };

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
        {/* Top Toolbar */}
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
            <button
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: currentTheme.cardBg, color: currentTheme.textPrimary,
                border: `1px solid ${currentTheme.border}`, borderRadius: 'var(--radius-md)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <span>📄</span> {isExportingPDF ? 'Wait...' : 'PDF'}
            </button>
            <button
              onClick={handleExportPPTX}
              disabled={isExportingPPTX}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentLit})`,
                color: '#ffffff',
                border: 'none', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: `0 2px 8px ${currentTheme.accent}30`,
              }}
            >
              <span>📊</span> {isExportingPPTX ? 'Wait...' : 'PPTX'}
            </button>

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
                <span>💡</span> {showNotes ? 'Speaker Notes (Visible)' : 'Speaker Notes (Hidden)'}
              </button>
            )}

            <span style={{ fontSize: 12, fontWeight: 700, color: currentTheme.textMuted }}>
              {current + 1} of {list.length}
            </span>
          </div>
        </div>

        {/* Presentation Slide Card */}
        <div
          className={`deck-card${isTitle ? ' is-title' : ''}`}
          style={{
            position: 'relative',
            background: 'transparent',
            borderColor: currentTheme.border,
            boxShadow: currentTheme.cardShadow,
          }}
        >
          <DeckBackground themeId={themeId} />
          {/* Main Slide Header & Text Body */}
          <div className="deck-card-body" style={{ position: 'relative', zIndex: 1 }}>
            <h1
              className="deck-title"
              style={{
                color: currentTheme.textPrimary,
                fontSize: isTitle ? '32px' : '26px',
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
          </div>

          {/* Fully Integrated Speaker Notes Drawer inside Slide Card */}
          {showNotes && slide.speakerNotes && (
            <div
              className="deck-notes-drawer"
              style={{
                position: 'relative',
                zIndex: 1,
                background: currentTheme.notesBg,
                borderColor: currentTheme.border,
                color: currentTheme.textSecondary,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${currentTheme.border}` }}>
                <span style={{ color: currentTheme.accent, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
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
