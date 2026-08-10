import { useState, useEffect, useRef } from 'react';

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

// ── PDF download via jsPDF ─────────────────────────────────────────────────
async function downloadPDF(slides, docTitle) {
  const { jsPDF } = await import('jspdf');
  const W = 297, H = 167.0625; // A4 landscape in mm (16:9)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });

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
      // Gradient fallback — dark background
      pdf.setFillColor(30, 27, 75);
      pdf.rect(0, 0, W, H, 'F');
    }

    // Dark overlay (semi-transparent via a filled rect with low opacity)
    pdf.setGState(pdf.GState({ opacity: 0.55 }));
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, 0, W, H, 'F');
    pdf.setGState(pdf.GState({ opacity: 1.0 }));

    // Slide number
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 180);
    pdf.text(`${i + 1} / ${slides.length}`, W - 10, 8, { align: 'right' });

    // Subtitle / label
    if (slide.subtitle && slide.type === 'title') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(165, 180, 252);
      pdf.text((slide.subtitle || '').toUpperCase(), 18, 28);
    }

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(slide.type === 'title' ? 26 : 20);
    pdf.setTextColor(255, 255, 255);
    const titleLines = pdf.splitTextToSize(slide.title || '', W - 36);
    pdf.text(titleLines, 18, slide.type === 'title' ? 42 : 95);

    // Bullets
    if (slide.bullets?.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(230, 230, 230);
      const startY = slide.type === 'title' ? 75 : 112;
      slide.bullets.forEach((b, bi) => {
        const lines = pdf.splitTextToSize(`• ${b}`, W - 40);
        pdf.text(lines, 22, startY + bi * 14);
      });
    }

    // Speaker notes (bottom strip)
    if (slide.speakerNotes) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.setTextColor(130, 130, 160);
      const noteLines = pdf.splitTextToSize(`Notes: ${slide.speakerNotes}`, W - 36);
      pdf.text(noteLines, 18, H - 10);
    }
  }

  pdf.save(`${docTitle || 'Slides'}_with_images.pdf`);
}

// ── PPTX download via pptxgenjs ────────────────────────────────────────────
async function downloadPPTX(slides, docTitle) {
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE'; // 16:9

  for (const slide of slides) {
    const sld = prs.addSlide();

    // Background image
    const imgSrc = slide.imageData || slide.imageUrl || '';
    if (imgSrc) {
      let b64 = imgSrc.startsWith('data:') ? imgSrc : await urlToBase64(imgSrc);
      if (b64) {
        // strip the data:image/...;base64, prefix
        const base64Data = b64.split(',')[1];
        const mimeMatch = b64.match(/data:([^;]+);/);
        const ext = mimeMatch ? mimeMatch[1].split('/')[1] || 'jpeg' : 'jpeg';
        try {
          sld.addImage({ data: `image/${ext};base64,${base64Data}`, x: 0, y: 0, w: '100%', h: '100%' });
        } catch {}
      }
    } else {
      sld.background = { fill: '1e1b4b' };
    }

    // Dark overlay rectangle
    sld.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: '100%',
      fill: { color: '000000', transparency: 45 },
      line: { color: '000000', transparency: 100 }
    });

    // Slide number badge
    sld.addText(`${slides.indexOf(slide) + 1} / ${slides.length}`, {
      x: 8.5, y: 0.1, w: 1, h: 0.3,
      fontSize: 8, color: 'aaaaaa', bold: false, align: 'right'
    });

    const isTitle = slide.type === 'title';

    // Subtitle label
    if (slide.subtitle && isTitle) {
      sld.addText((slide.subtitle || '').toUpperCase(), {
        x: 0.4, y: isTitle ? 1.2 : 3.5, w: 8.5, h: 0.4,
        fontSize: 9, color: 'a5b4fc', bold: true, charSpacing: 3
      });
    }

    // Title
    sld.addText(slide.title || '', {
      x: 0.4,
      y: isTitle ? 1.8 : 3.0,
      w: 8.5, h: isTitle ? 1.4 : 1.0,
      fontSize: isTitle ? 36 : 28,
      color: 'ffffff', bold: true, breakLine: false,
      shadow: { type: 'outer', color: '000000', blur: 8, offset: 4, angle: 45, opacity: 0.6 }
    });

    // Bullets
    if (slide.bullets?.length > 0) {
      const bulletItems = slide.bullets.map(b => ({
        text: b,
        options: { bullet: { code: '2022' }, color: 'eeeeee', fontSize: 13, paraSpaceAfter: 6 }
      }));
      sld.addText(bulletItems, {
        x: 0.4, y: isTitle ? 3.4 : 4.1, w: 8.6, h: 1.8,
        fontSize: 13, color: 'eeeeee', breakLine: true
      });
    }

    // Speaker notes
    if (slide.speakerNotes) {
      sld.addNotes(slide.speakerNotes);
    }
  }

  await prs.writeFile({ fileName: `${docTitle || 'Slides'}_with_images.pptx` });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function SlidesWithImagesViewer({ slides, docTitle }) {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const [animDir, setAnimDir] = useState('');
  const [exporting, setExporting] = useState(null); // 'pdf' | 'pptx' | null
  const [exportError, setExportError] = useState('');
  const list = Array.isArray(slides) ? slides : [];
  const slide = list[current];

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigate(-1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [current, list.length]);

  function navigate(dir) {
    const next = current + dir;
    if (next < 0 || next >= list.length) return;
    setVisible(false);
    setAnimDir(dir > 0 ? 'left' : 'right');
    setTimeout(() => {
      setCurrent(next);
      setVisible(true);
    }, 180);
  }

  async function handleExport(type) {
    if (exporting) return;
    setExporting(type);
    setExportError('');
    try {
      const title = docTitle || 'Presentation';
      if (type === 'pdf')  await downloadPDF(list, title);
      if (type === 'pptx') await downloadPPTX(list, title);
    } catch (e) {
      console.error(e);
      setExportError(`Export failed: ${e.message}`);
    } finally {
      setExporting(null);
    }
  }

  if (!slide) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>No slides available.</div>
  );

  const hasImage = !!(slide.imageData || slide.imageUrl);
  const imgSrc   = slide.imageData || slide.imageUrl || '';
  const isTitle  = slide.type === 'title';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Thumbnail Sidebar ── */}
      <div style={{
        width: 168, minWidth: 168,
        background: 'rgba(10,10,20,0.6)',
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto', padding: '12px 8px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {list.map((s, i) => {
          const thumbSrc = s.imageData || s.imageUrl || '';
          return (
            <button key={i} onClick={() => { setVisible(true); setCurrent(i); }} style={{
              border: i === current ? '2px solid #6366f1' : '2px solid transparent',
              borderRadius: 8, overflow: 'hidden', padding: 0,
              cursor: 'pointer', background: 'transparent',
              boxShadow: i === current ? '0 0 12px rgba(99,102,241,0.5)' : 'none',
              transition: 'all 0.2s', flexShrink: 0,
            }}>
              <div style={{
                width: '100%', aspectRatio: '16/9',
                background: thumbSrc
                  ? `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)), url(${thumbSrc}) center/cover`
                  : 'linear-gradient(135deg,#1e1b4b,#312e81)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: '6px 7px',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{i + 1}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Main Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Export Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end',
          padding: '8px 16px',
          background: 'rgba(10,10,20,0.5)', borderBottom: '1px solid var(--border-color)',
        }}>
          {exportError && (
            <span style={{ fontSize: 11, color: '#f87171', marginRight: 8 }}>⚠ {exportError}</span>
          )}
          <button
            id="export-pdf-btn"
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem',
              fontFamily: 'var(--font-heading)', fontWeight: 600,
              background: exporting === 'pdf' ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: exporting === 'pdf' ? '#fca5a5' : '#f87171',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {exporting === 'pdf' ? '⏳' : '📄'} {exporting === 'pdf' ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button
            id="export-pptx-btn"
            onClick={() => handleExport('pptx')}
            disabled={!!exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem',
              fontFamily: 'var(--font-heading)', fontWeight: 600,
              background: exporting === 'pptx' ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.4)',
              color: exporting === 'pptx' ? '#fcd34d' : '#f59e0b',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {exporting === 'pptx' ? '⏳' : '📊'} {exporting === 'pptx' ? 'Generating PPTX...' : 'Download PPTX'}
          </button>
        </div>

        {/* ── Slide Card ── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 28px', overflow: 'hidden' }}>
          <div style={{
            width: '100%', maxWidth: 840, aspectRatio: '16/9',
            borderRadius: 16, overflow: 'hidden', position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            background: hasImage ? `url(${imgSrc}) center/cover no-repeat` : 'linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0) scale(1)' : `translateX(${animDir === 'left' ? '-36px' : '36px'}) scale(0.97)`,
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}>
            {/* Dark overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: isTitle
                ? 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.85) 100%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.88) 100%)',
            }} />

            {/* Slide number */}
            <div style={{
              position: 'absolute', top: 14, right: 18,
              fontSize: 10, color: 'rgba(255,255,255,0.45)',
              fontFamily: 'var(--font-heading)',
              background: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: '2px 9px',
            }}>{current + 1} / {list.length}</div>

            {/* Content */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: isTitle ? 'center' : 'flex-end',
              padding: isTitle ? '36px 52px' : '24px 44px 32px',
            }}>
              {slide.subtitle && isTitle && (
                <div style={{ fontSize: 11, fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'rgba(165,180,252,0.9)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 }}>
                  {slide.subtitle}
                </div>
              )}
              <h2 style={{
                fontSize: isTitle ? '2.2rem' : '1.7rem', fontFamily: 'var(--font-heading)', fontWeight: 800,
                color: '#fff', lineHeight: 1.2, marginBottom: isTitle ? 18 : 14,
                textShadow: '0 2px 12px rgba(0,0,0,0.7)',
              }}>{slide.title}</h2>

              {slide.bullets?.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {slide.bullets.map((b, bi) => (
                    <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a5b4fc', flexShrink: 0, marginTop: 7 }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {slide.speakerNotes && (
                <div style={{ marginTop: 14, padding: '7px 12px', background: 'rgba(0,0,0,0.4)', borderRadius: 7, borderLeft: '3px solid rgba(165,180,252,0.5)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'rgba(165,180,252,0.7)' }}>Notes: </strong>{slide.speakerNotes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '10px 24px',
          background: 'rgba(10,10,20,0.5)', borderTop: '1px solid var(--border-color)',
        }}>
          <button onClick={() => navigate(-1)} disabled={current === 0} style={{
            padding: '7px 18px', borderRadius: 8,
            background: current === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: current === 0 ? 'var(--text-muted)' : '#a5b4fc',
            fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 600,
            cursor: current === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
          }}>← Prev</button>

          <div style={{ display: 'flex', gap: 5 }}>
            {list.map((_, i) => (
              <div key={i} onClick={() => setCurrent(i)} style={{
                width: i === current ? 22 : 7, height: 7, borderRadius: 4,
                background: i === current ? '#6366f1' : 'rgba(255,255,255,0.2)',
                cursor: 'pointer', transition: 'all 0.28s',
              }} />
            ))}
          </div>

          <button onClick={() => navigate(1)} disabled={current === list.length - 1} style={{
            padding: '7px 18px', borderRadius: 8,
            background: current === list.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: current === list.length - 1 ? 'var(--text-muted)' : '#a5b4fc',
            fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 600,
            cursor: current === list.length - 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
          }}>Next →</button>
        </div>
      </div>
    </div>
  );
}
