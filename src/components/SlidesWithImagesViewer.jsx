import { useState, useEffect } from 'react';

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
      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, 0, W, H, 'F');
    }

    // Semi-transparent dark overlay for text contrast on image
    pdf.setGState(pdf.GState({ opacity: 0.55 }));
    pdf.setFillColor(15, 23, 42);
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
        const base64Data = b64.split(',')[1];
        const mimeMatch = b64.match(/data:([^;]+);/);
        const ext = mimeMatch ? mimeMatch[1].split('/')[1] || 'jpeg' : 'jpeg';
        try {
          sld.addImage({ data: `image/${ext};base64,${base64Data}`, x: 0, y: 0, w: '100%', h: '100%' });
        } catch {}
      }
    } else {
      sld.background = { fill: 'f8fafc' };
    }

    // Dark overlay rectangle
    sld.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: '100%',
      fill: { color: '0f172a', transparency: 45 },
      line: { color: '0f172a', transparency: 100 }
    });

    // Slide number badge
    sld.addText(`${slides.indexOf(slide) + 1} / ${slides.length}`, {
      x: 8.5, y: 0.1, w: 1, h: 0.3,
      fontSize: 8, color: 'cccccc', bold: false, align: 'right'
    });

    const isTitle = slide.type === 'title';

    // Subtitle label
    if (slide.subtitle && isTitle) {
      sld.addText((slide.subtitle || '').toUpperCase(), {
        x: 0.4, y: isTitle ? 1.2 : 3.5, w: 8.5, h: 0.4,
        fontSize: 9, color: 'c4b5fd', bold: true, charSpacing: 3
      });
    }

    // Title
    sld.addText(slide.title || '', {
      x: 0.4,
      y: isTitle ? 1.8 : 1.2,
      w: 8.5, h: isTitle ? 1.4 : 1.0,
      fontSize: isTitle ? 36 : 28,
      color: 'ffffff', bold: true, breakLine: false,
      shadow: { type: 'outer', color: '000000', blur: 8, offset: 4, angle: 45, opacity: 0.6 }
    });

    // Bullets
    if (slide.bullets?.length > 0) {
      const bulletItems = slide.bullets.map(b => ({
        text: b,
        options: { bullet: { code: '2022' }, color: 'ffffff', fontSize: 13, paraSpaceAfter: 6 }
      }));
      sld.addText(bulletItems, {
        x: 0.4, y: isTitle ? 3.4 : 2.5, w: 8.6, h: 2.5,
        fontSize: 13, color: 'ffffff', breakLine: true
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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* ── Thumbnail Sidebar ── */}
      <div style={{
        width: 220, minWidth: 220,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto', padding: '14px 10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {list.map((s, i) => {
          const thumbSrc = s.imageData || s.imageUrl || '';
          const isActive = i === current;
          return (
            <button
              key={i}
              onClick={() => { setVisible(true); setCurrent(i); }}
              style={{
                border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                padding: 0,
                cursor: 'pointer',
                background: isActive ? '#f3e8ff' : '#ffffff',
                boxShadow: isActive ? '0 4px 14px rgba(109, 40, 217, 0.15)' : 'var(--shadow-sm)',
                transition: 'var(--transition)',
                flexShrink: 0,
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '100%', aspectRatio: '16/9',
                background: thumbSrc
                  ? `url(${thumbSrc}) center/cover no-repeat`
                  : 'linear-gradient(135deg, #f3e8ff, #e2e8f0)',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 4, left: 6,
                  fontSize: 10, fontWeight: 700,
                  color: thumbSrc ? '#ffffff' : 'var(--accent)',
                  background: thumbSrc ? 'rgba(15,23,42,0.6)' : '#ffffff',
                  padding: '1px 6px', borderRadius: 4,
                  fontFamily: 'var(--font-heading)',
                }}>
                  {i + 1}
                </div>
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  fontFamily: 'var(--font-heading)',
                }}>
                  {s.title}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Main Presentation Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Export Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end',
          padding: '10px 24px',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}>
          {exportError && (
            <span style={{ fontSize: 12, color: 'var(--red)', marginRight: 8 }}>⚠ {exportError}</span>
          )}
          <button
            id="export-pdf-btn"
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
              fontFamily: 'var(--font-heading)', fontWeight: 600,
              background: '#ffffff',
              border: '1px solid rgba(219, 39, 119, 0.3)',
              color: 'var(--pink)',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'var(--transition)',
              boxShadow: 'var(--shadow-sm)',
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
              padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
              fontFamily: 'var(--font-heading)', fontWeight: 600,
              background: 'var(--accent)',
              border: 'none',
              color: '#ffffff',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'var(--transition)',
              boxShadow: '0 4px 14px rgba(109, 40, 217, 0.2)',
            }}
          >
            {exporting === 'pptx' ? '⏳' : '📊'} {exporting === 'pptx' ? 'Generating PPTX...' : 'Download PPTX'}
          </button>
        </div>

        {/* ── Slide Canvas Presentation Card ── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 36px', overflow: 'hidden' }}>
          <div style={{
            width: '100%', maxWidth: 860, aspectRatio: '16/9',
            borderRadius: 'var(--radius-xl)', overflow: 'hidden', position: 'relative',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-med)',
            background: hasImage ? `url(${imgSrc}) center/cover no-repeat` : 'linear-gradient(135deg, #ffffff 0%, #f3e8ff 100%)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0) scale(1)' : `translateX(${animDir === 'left' ? '-24px' : '24px'}) scale(0.98)`,
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}>
            {/* Overlay gradient for maximum readability */}
            <div style={{
              position: 'absolute', inset: 0,
              background: hasImage
                ? 'linear-gradient(to bottom, rgba(15,23,42,0.2) 0%, rgba(15,23,42,0.65) 50%, rgba(15,23,42,0.9) 100%)'
                : 'transparent',
            }} />

            {/* Slide counter badge */}
            <div style={{
              position: 'absolute', top: 16, right: 20,
              fontSize: 11, fontWeight: 700,
              color: hasImage ? '#ffffff' : 'var(--accent)',
              fontFamily: 'var(--font-heading)',
              background: hasImage ? 'rgba(15,23,42,0.6)' : '#ffffff',
              borderRadius: 20, padding: '3px 12px',
              border: hasImage ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-hi)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {current + 1} / {list.length}
            </div>

            {/* Content Container */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: isTitle ? 'center' : 'flex-end',
              padding: isTitle ? '40px 56px' : '28px 48px 36px',
            }}>
              {slide.subtitle && isTitle && (
                <div style={{
                  fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700,
                  color: hasImage ? '#c4b5fd' : 'var(--accent)',
                  letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12,
                }}>
                  {slide.subtitle}
                </div>
              )}
              <h2 style={{
                fontSize: isTitle ? '2.3rem' : '1.75rem', fontFamily: 'var(--font-heading)', fontWeight: 800,
                color: hasImage ? '#ffffff' : 'var(--text-primary)', lineHeight: 1.25, marginBottom: isTitle ? 18 : 14,
                textShadow: hasImage ? '0 2px 12px rgba(0,0,0,0.8)' : 'none',
              }}>
                {slide.title}
              </h2>

              {slide.bullets?.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {slide.bullets.map((b, bi) => (
                    <li key={bi} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      fontSize: '0.92rem',
                      color: hasImage ? 'rgba(255,255,255,0.95)' : 'var(--text-primary)',
                      lineHeight: 1.55,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: hasImage ? '#c4b5fd' : 'var(--accent)',
                        flexShrink: 0, marginTop: 7,
                      }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {slide.speakerNotes && (
                <div style={{
                  marginTop: 16, padding: '8px 14px',
                  background: hasImage ? 'rgba(15,23,42,0.65)' : '#ffffff',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${hasImage ? '#c4b5fd' : 'var(--accent)'}`,
                  fontSize: '0.75rem',
                  color: hasImage ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)',
                  lineHeight: 1.5,
                  boxShadow: hasImage ? 'none' : 'var(--shadow-sm)',
                }}>
                  <strong style={{ color: hasImage ? '#c4b5fd' : 'var(--accent)' }}>Notes: </strong>
                  {slide.speakerNotes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Navigation Controls ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '12px 24px',
          background: '#ffffff', borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => navigate(-1)}
            disabled={current === 0}
            className="btn-secondary"
            style={{ opacity: current === 0 ? 0.5 : 1, cursor: current === 0 ? 'not-allowed' : 'pointer' }}
          >
            ← Prev
          </button>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {list.map((_, i) => (
              <div
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === current ? 'var(--accent)' : 'var(--border-med)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => navigate(1)}
            disabled={current === list.length - 1}
            className="btn-secondary"
            style={{ opacity: current === list.length - 1 ? 0.5 : 1, cursor: current === list.length - 1 ? 'not-allowed' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
