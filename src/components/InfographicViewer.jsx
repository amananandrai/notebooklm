import { useEffect, useRef, useState } from 'react';

export default function InfographicViewer({ data }) {
  const containerRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Stagger-animate structured layout on mount
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    if (!containerRef.current || data?.imageData) return;
    const els = containerRef.current.querySelectorAll('[data-animate]');
    els.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = `opacity 0.5s ease ${i * 0.08}s, transform 0.5s ease ${i * 0.08}s`;
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }, [data]);

  if (!data) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>No infographic data.</div>
  );

  // ── AI Image Mode (Gemini Flash Image Generation) ──────────────
  if (data.imageData) {
    return (
      <div style={{
        height: '100%', overflowY: 'auto',
        background: 'var(--bg-main)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 32px', gap: 20,
      }}>
        {/* Header */}
        <div style={{
          width: '100%', maxWidth: 860,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#6366f1', fontFamily: 'var(--font-heading)', marginBottom: 4 }}>
              📈 AI-Generated Infographic
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>
              {data.title}
            </div>
            {data.subtitle && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                {data.subtitle}
              </div>
            )}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.05)',
            padding: '4px 10px', borderRadius: 20,
            border: '1px solid var(--border-color)',
            fontFamily: 'var(--font-heading)', whiteSpace: 'nowrap',
          }}>
            ✦ Gemini Flash Image
          </div>
        </div>

        {/* Infographic Image */}
        <div style={{
          width: '100%', maxWidth: 860,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 80px rgba(0,0,0,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          background: '#0d0d1a',
          minHeight: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {!imgLoaded && !imgError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>Rendering infographic...</div>
            </div>
          )}
          {imgError && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: '0.85rem' }}>Image could not be rendered. The structured layout is shown below.</div>
            </div>
          )}
          <img
            src={data.imageData}
            alt={`Infographic: ${data.title}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgLoaded(true); setImgError(true); }}
            style={{
              width: '100%', display: imgLoaded && !imgError ? 'block' : 'none',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          />
        </div>

        {/* Download hint */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>💡</span>
          Right-click the image to save it, or use the Download button above.
        </div>
      </div>
    );
  }

  // ── Structured HTML Fallback Mode ──────────────────────────────
  const {
    title = 'Document Infographic',
    subtitle = '',
    accentColor = '#6366f1',
    accentColor2 = '#8b5cf6',
    stats = [],
    sections = [],
    timeline = [],
    keyInsight = '',
  } = data;

  return (
    <div ref={containerRef} style={{
      height: '100%', overflowY: 'auto', padding: '32px 40px',
      background: 'var(--bg-main)', fontFamily: 'var(--font-body)',
    }}>
      {/* Header Band */}
      <div data-animate style={{
        borderRadius: 20, padding: '36px 48px', marginBottom: 28,
        background: `linear-gradient(135deg, ${accentColor}33 0%, ${accentColor2}22 100%)`,
        border: `1px solid ${accentColor}44`, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 220, height: 220, borderRadius: '50%', background: `${accentColor}18`, filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: accentColor, marginBottom: 12, fontFamily: 'var(--font-heading)' }}>
          📈 AI-Generated Infographic
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', lineHeight: 1.2, margin: 0, marginBottom: 12, fontFamily: 'var(--font-heading)' }}>{title}</h1>
        <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>{subtitle}</p>
      </div>

      {/* Key Stats */}
      {stats.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 14 }}>Key Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 14 }}>
            {stats.map((stat, i) => (
              <div data-animate key={i} style={{ borderRadius: 16, padding: '22px 20px', background: `linear-gradient(135deg, ${accentColor}18, ${accentColor2}0d)`, border: `1px solid ${accentColor}30`, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'default', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${accentColor}30`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ fontSize: 28 }}>{stat.icon}</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: accentColor, fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>{stat.label}</div>
                {stat.desc && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{stat.desc}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 14 }}>Key Sections</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {sections.map((sec, i) => {
              const c = sec.color || accentColor;
              return (
                <div data-animate key={i} style={{ borderRadius: 16, padding: '24px', background: 'var(--bg-elevated)', border: `1px solid ${c}30`, borderLeft: `4px solid ${c}`, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 32px ${c}25`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{sec.icon}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>{sec.title}</div>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{sec.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 18 }}>Timeline & Flow</div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${accentColor}, ${accentColor2})`, borderRadius: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((item, i) => (
                <div data-animate key={i} style={{ display: 'flex', gap: 20, paddingBottom: i < timeline.length - 1 ? 28 : 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-heading)', boxShadow: `0 0 20px ${accentColor}60`, zIndex: 1, marginLeft: -7 }}>{item.step}</div>
                  <div style={{ flex: 1, padding: '6px 0 0' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Key Insight */}
      {keyInsight && (
        <div data-animate style={{ borderRadius: 20, padding: '28px 36px', background: `linear-gradient(135deg, ${accentColor}22, ${accentColor2}15)`, border: `1px solid ${accentColor}40`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 20, top: 12, fontSize: 80, color: `${accentColor}25`, fontFamily: 'Georgia, serif', lineHeight: 1, userSelect: 'none' }}>"</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: accentColor, fontFamily: 'var(--font-heading)', marginBottom: 12 }}>💡 Key Insight</div>
          <blockquote style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, fontStyle: 'italic' }}>{keyInsight}</blockquote>
        </div>
      )}
    </div>
  );
}
