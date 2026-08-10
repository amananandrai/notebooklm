import { useState, useEffect } from 'react';

export default function SlidesWithImagesViewer({ slides }) {
  const [current, setCurrent] = useState(0);
  const [animDir, setAnimDir] = useState('');
  const [visible, setVisible] = useState(true);
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
    setAnimDir(dir > 0 ? 'out-left' : 'out-right');
    setVisible(false);
    setTimeout(() => {
      setCurrent(next);
      setAnimDir(dir > 0 ? 'in-right' : 'in-left');
      setVisible(true);
    }, 200);
  }

  if (!slide) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>
      No slides available.
    </div>
  );

  const hasImage = !!slide.imageData;
  const isTitle = slide.type === 'title';

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, overflow: 'hidden' }}>
      {/* Thumbnail Sidebar */}
      <div style={{
        width: 168,
        minWidth: 168,
        background: 'rgba(10,10,20,0.6)',
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto',
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {list.map((s, i) => (
          <button
            key={i}
            onClick={() => { setVisible(true); setCurrent(i); }}
            style={{
              border: i === current ? '2px solid var(--accent-indigo)' : '2px solid transparent',
              borderRadius: 8,
              overflow: 'hidden',
              padding: 0,
              cursor: 'pointer',
              background: 'transparent',
              boxShadow: i === current ? '0 0 12px rgba(99,102,241,0.5)' : 'none',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: '100%',
              aspectRatio: '16/9',
              background: s.imageData
                ? `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${s.imageData}) center/cover`
                : 'linear-gradient(135deg, #1e1b4b, #312e81)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '6px 7px',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{i + 1}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Main Slide Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', overflow: 'hidden' }}>
          <div style={{
            width: '100%',
            maxWidth: 860,
            aspectRatio: '16/9',
            borderRadius: 16,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            background: hasImage
              ? `url(${slide.imageData}) center/cover no-repeat`
              : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0) scale(1)' : `translateX(${animDir.includes('left') ? '-40px' : '40px'}) scale(0.97)`,
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}>
            {/* Dark overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: isTitle
                ? 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.85) 100%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.88) 100%)',
            }} />

            {/* Slide number badge */}
            <div style={{
              position: 'absolute', top: 16, right: 20,
              fontSize: 11, color: 'rgba(255,255,255,0.5)',
              fontFamily: 'var(--font-heading)',
              background: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: '3px 10px',
            }}>
              {current + 1} / {list.length}
            </div>

            {/* Slide Content */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: isTitle ? 'center' : 'flex-end',
              padding: isTitle ? '40px 56px' : '28px 48px 36px',
            }}>
              {slide.subtitle && isTitle && (
                <div style={{
                  fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500,
                  color: 'rgba(165,180,252,0.9)', letterSpacing: 3, textTransform: 'uppercase',
                  marginBottom: 14,
                }}>
                  {slide.subtitle}
                </div>
              )}

              <h2 style={{
                fontSize: isTitle ? '2.4rem' : '1.8rem',
                fontFamily: 'var(--font-heading)', fontWeight: 800,
                color: '#fff', lineHeight: 1.2, marginBottom: isTitle ? 20 : 16,
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}>
                {slide.title}
              </h2>

              {slide.bullets?.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {slide.bullets.map((b, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.95rem', color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a5b4fc', flexShrink: 0, marginTop: 6 }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {slide.speakerNotes && (
                <div style={{
                  marginTop: 16, padding: '8px 14px',
                  background: 'rgba(0,0,0,0.45)', borderRadius: 8,
                  borderLeft: '3px solid rgba(165,180,252,0.6)',
                  fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
                }}>
                  <strong style={{ color: 'rgba(165,180,252,0.7)' }}>Notes: </strong>
                  {slide.speakerNotes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '12px 24px',
          background: 'rgba(10,10,20,0.5)', borderTop: '1px solid var(--border-color)',
        }}>
          <button
            onClick={() => navigate(-1)}
            disabled={current === 0}
            style={{
              padding: '8px 20px', borderRadius: 8,
              background: current === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              color: current === 0 ? 'var(--text-muted)' : '#a5b4fc',
              fontSize: '0.85rem', fontFamily: 'var(--font-heading)', fontWeight: 600,
              cursor: current === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}
          >
            ← Prev
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            {list.map((_, i) => (
              <div key={i} onClick={() => setCurrent(i)} style={{
                width: i === current ? 24 : 8, height: 8, borderRadius: 4,
                background: i === current ? '#6366f1' : 'rgba(255,255,255,0.2)',
                cursor: 'pointer', transition: 'all 0.3s',
              }} />
            ))}
          </div>

          <button
            onClick={() => navigate(1)}
            disabled={current === list.length - 1}
            style={{
              padding: '8px 20px', borderRadius: 8,
              background: current === list.length - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              color: current === list.length - 1 ? 'var(--text-muted)' : '#a5b4fc',
              fontSize: '0.85rem', fontFamily: 'var(--font-heading)', fontWeight: 600,
              cursor: current === list.length - 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
