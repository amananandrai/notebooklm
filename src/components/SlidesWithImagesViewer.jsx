import { useState, useEffect } from 'react';
import { IMAGE_SLIDE_THEMES } from '../utils/themes';

// ── Image loader: fetch a URL and return a base64 data URI ──────────────────
async function urlToBase64(url) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    const blob = await resp.blob();
    return await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── PDF download via jsPDF with active theme colors ─────────────────────────
async function downloadPDF(slides, docTitle, activeTheme) {
  const theme = IMAGE_SLIDE_THEMES[activeTheme] || IMAGE_SLIDE_THEMES.light_slate;
  const { jsPDF } = await import('jspdf');
  const W = 297, H = 167.0625; // A4 landscape in mm (16:9)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });

  const [overlayR, overlayG, overlayB] = theme.pdfOverlay || [15, 23, 42];
  const overlayOpacity = theme.pdfOverlayOpacity || 0.55;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (i > 0) pdf.addPage([W, H], 'landscape');

    // Background image
    const imgSrc = slide.imageData || slide.imageUrl || '';
    if (imgSrc) {
      let b64 = imgSrc.startsWith('data:') ? imgSrc : await urlToBase64(imgSrc);
      if (b64) {
        try { pdf.addImage(b64, 'JPEG', 0, 0, W, H); } catch {}
      }
    } else {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, 0, W, H, 'F');
    }

    // Themed overlay for text contrast on image
    pdf.setGState(pdf.GState({ opacity: overlayOpacity }));
    pdf.setFillColor(overlayR, overlayG, overlayB);
    pdf.rect(0, 0, W, H, 'F');
    pdf.setGState(pdf.GState({ opacity: 1.0 }));

    // Slide number
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(200, 200, 220);
    pdf.text(`${i + 1} / ${slides.length}`, W - 10, 10, { align: 'right' });

    // Subtitle / label
    if (slide.subtitle && slide.type === 'title') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(196, 181, 253);
      pdf.text((slide.subtitle || '').toUpperCase(), 18, 28);
    }

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(slide.type === 'title' ? 26 : 20);
    pdf.setTextColor(255, 255, 255);
    const titleLines = pdf.splitTextToSize(slide.title || '', W - 36);
    pdf.text(titleLines, 18, slide.type === 'title' ? 44 : 40);

    // Bullets
    if (slide.bullets?.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(240, 240, 255);
      const startY = slide.type === 'title' ? 80 : 70;
      slide.bullets.forEach((b, bi) => {
        const lines = pdf.splitTextToSize(`• ${b}`, W - 40);
        pdf.text(lines, 22, startY + bi * 14);
      });
    }

    // Speaker notes (bottom strip)
    if (slide.speakerNotes) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7.5);
      pdf.setTextColor(180, 180, 210);
      const noteLines = pdf.splitTextToSize(`Notes: ${slide.speakerNotes}`, W - 36);
      pdf.text(noteLines, 18, H - 12);
    }
  }

  pdf.save(`${docTitle || 'Slides'}_with_images.pdf`);
}

// ── PPTX download via pptxgenjs with active theme colors ────────────────────
async function downloadPPTX(slides, docTitle, activeTheme) {
  const theme = IMAGE_SLIDE_THEMES[activeTheme] || IMAGE_SLIDE_THEMES.light_slate;
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE'; // 16:9

  for (const slide of slides) {
    const sld = prs.addSlide();

    // Background image or solid color
    const imgSrc = slide.imageData || slide.imageUrl || '';
    if (imgSrc) {
      sld.background = { data: imgSrc.startsWith('data:') ? imgSrc : undefined, path: !imgSrc.startsWith('data:') ? imgSrc : undefined };
    } else {
      sld.background = { color: theme.pptxBg || '0F172A' };
    }

    // Dark semi-transparent card shape over image for readable text
    sld.addShape(prs.ShapeType.rect, {
      x: 0.6, y: 0.5, w: 12.13, h: 6.5,
      fill: { color: '000000', transparency: 45 },
      line: { color: theme.pptxAccent || '6D28D9', width: 1.5, transparency: 50 },
    });

    // Slide Number & Theme Badge
    sld.addText(`Slide ${slide.id} · ${theme.name}`, {
      x: 1.0, y: 0.8, w: 5.0, h: 0.4,
      fontSize: 11, bold: true, color: theme.pptxAccent || 'C4B5FD', fontFace: 'Helvetica',
    });

    // Title
    sld.addText(slide.title, {
      x: 1.0, y: 1.2, w: 11.3, h: 1.0,
      fontSize: slide.type === 'title' ? 32 : 24,
      bold: true, color: 'FFFFFF', fontFace: 'Helvetica',
    });

    // Subtitle
    if (slide.subtitle) {
      sld.addText(slide.subtitle, {
        x: 1.0, y: 2.1, w: 11.3, h: 0.5,
        fontSize: 13, italic: true, color: 'CBD5E1', fontFace: 'Helvetica',
      });
    }

    // Bullets
    if (slide.bullets && slide.bullets.length > 0) {
      const bulletItems = slide.bullets.map(b => ({
        text: b,
        options: { fontSize: 13, color: 'F1F5F9', bullet: true, spaceAfter: 10, fontFace: 'Helvetica' },
      }));
      sld.addText(bulletItems, {
        x: 1.0, y: slide.subtitle ? 2.7 : 2.3, w: 11.3, h: 3.5,
      });
    }

    // Speaker notes in PowerPoint notes field
    if (slide.speakerNotes) {
      sld.addNotes(slide.speakerNotes);
    }
  }

  await prs.writeFile({ fileName: `${docTitle || 'Slides'}_with_images.pptx` });
}

export default function SlidesWithImagesViewer({ slides, docTitle, activeTheme = 'light_slate', onThemeChange }) {
  const [current, setCurrent] = useState(0);
  const [themeId, setThemeId] = useState(activeTheme);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingPPTX, setIsExportingPPTX] = useState(false);

  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];
  const currentTheme = IMAGE_SLIDE_THEMES[themeId] || IMAGE_SLIDE_THEMES.light_slate;

  const handleSelectTheme = (tId) => {
    setThemeId(tId);
    if (onThemeChange) onThemeChange(tId);
  };

  if (!slide) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>No visual slides available.</div>;

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

  return (
    <div className="slides-layout" style={{ background: currentTheme.bg }}>
      {/* Left thumbnail sidebar */}
      <div
        className="slides-sidebar"
        style={{
          background: currentTheme.cardBg,
          borderColor: currentTheme.border,
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${currentTheme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: currentTheme.textMuted }}>
            {list.length} Slides
          </span>

          {/* Theme Dropdown */}
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
            {Object.values(IMAGE_SLIDE_THEMES).map(t => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((s, i) => {
            const imgSrc = s.imageData || s.imageUrl;
            return (
              <div
                key={i}
                className={`slide-thumb${i === current ? ' active' : ''}`}
                style={{
                  borderColor: i === current ? currentTheme.accent : currentTheme.border,
                  background: i === current ? currentTheme.accentBadgeBg : 'transparent',
                }}
                onClick={() => setCurrent(i)}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={`Slide ${i + 1}`}
                      style={{ width: 36, height: 22, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 36, height: 22, background: currentTheme.bg, borderRadius: 3, display: 'grid', placeItems: 'center', fontSize: 10 }}>
                      🖼️
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="slide-thumb-num" style={{ color: currentTheme.textMuted }}>Slide {i + 1}</div>
                    <div className="slide-thumb-title" style={{ color: currentTheme.textPrimary }}>{s.title}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Slide Canvas */}
      <div className="slide-main" style={{ background: currentTheme.bg }}>
        {/* Top Export Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 840, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: currentTheme.textPrimary }}>
              {currentTheme.icon} {currentTheme.name}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: currentTheme.accentBadgeBg, color: currentTheme.accent, border: `1px solid ${currentTheme.accentBadgeBorder}`, fontWeight: 600 }}>
              {currentTheme.badge}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
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
              <span>📄</span> {isExportingPDF ? 'Generating PDF...' : 'Download PDF'}
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
              <span>📊</span> {isExportingPPTX ? 'Exporting PPTX...' : 'Export PPTX'}
            </button>
          </div>
        </div>

        {/* Flexible Aspect Ratio Slide Canvas */}
        <div
          style={{
            width: '100%',
            maxWidth: 840,
            minHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: `0 12px 40px ${currentTheme.accent}20`,
            border: `1px solid ${currentTheme.border}`,
            background: currentTheme.canvasBg,
          }}
        >
          {/* Background Illustration */}
          {(slide.imageData || slide.imageUrl) && (
            <img
              src={slide.imageData || slide.imageUrl}
              alt={slide.title}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', zIndex: 0,
              }}
            />
          )}

          {/* Themed Contrast Gradient Overlay */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: currentTheme.overlayGradient,
              zIndex: 1,
            }}
          />

          {/* Slide Text Content */}
          <div
            style={{
              position: 'relative', zIndex: 2,
              flex: 1, boxSizing: 'border-box',
              padding: '36px 42px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              color: '#ffffff',
            }}
          >
            {/* Top Bar: Subtitle and Counter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {slide.subtitle ? (
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: currentTheme.accentLit || '#c4b5fd' }}>
                  {slide.subtitle}
                </span>
              ) : <div />}
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: 99 }}>
                {current + 1} / {list.length}
              </span>
            </div>

            {/* Middle: Title & Bullets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: slide.type === 'title' ? 32 : 24, fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.3px', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {slide.title}
              </h2>

              {slide.bullets && slide.bullets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {slide.bullets.map((b, bi) => (
                    <div key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.5, opacity: 0.95, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                      <span style={{ color: currentTheme.accentLit || '#c4b5fd', fontWeight: 700, marginTop: -1 }}>•</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom: Speaker Notes */}
            {slide.speakerNotes && (
              <div style={{ fontSize: 13, fontStyle: 'italic', opacity: 0.85, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 12, marginTop: 16, lineHeight: 1.6 }}>
                💡 {slide.speakerNotes}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="slides-nav" style={{ marginTop: 16 }}>
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
