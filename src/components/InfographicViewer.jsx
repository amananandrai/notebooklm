import { useEffect, useRef } from 'react';

export default function InfographicViewer({ data }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const els = containerRef.current.querySelectorAll('[data-animate]');
    els.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = `opacity 0.45s ease ${i * 0.07}s, transform 0.45s ease ${i * 0.07}s`;
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }, [data]);

  if (!data) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>No infographic data.</div>
  );

  const {
    title = 'Document Infographic',
    subtitle = '',
    accentColor = '#6d28d9',
    accentColor2 = '#db2777',
    heroImage = '',
    stats = [],
    sections = [],
    timeline = [],
    keyInsight = '',
  } = data;

  return (
    <div ref={containerRef} style={{
      height: '100%',
      overflowY: 'auto',
      padding: '28px 36px',
      background: 'var(--bg-base)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        {/* ── Header Band with AI Hero Image ── */}
        <div data-animate style={{
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 28,
          border: '1px solid rgba(109, 40, 217, 0.2)',
          background: 'linear-gradient(135deg, rgba(243, 232, 255, 0.9) 0%, rgba(255, 241, 242, 0.8) 100%)',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
        }}>
          {/* AI Generated Hero Graphic */}
          {heroImage && (
            <div style={{
              width: '100%',
              height: 190,
              background: `url(${heroImage}) center/cover no-repeat`,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(248,250,252,0.95) 100%)',
              }} />
            </div>
          )}

          <div style={{ padding: heroImage ? '12px 36px 32px' : '36px', position: 'relative' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: accentColor, marginBottom: 10,
              fontFamily: 'var(--font-heading)',
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 20,
              background: '#ffffff',
              border: '1px solid rgba(109, 40, 217, 0.2)',
              boxShadow: '0 2px 8px rgba(109, 40, 217, 0.08)',
            }}>
              📈 AI Infographic Overview
            </div>
            <h1 style={{
              fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)',
              lineHeight: 1.25, margin: '8px 0 10px',
              fontFamily: 'var(--font-heading)',
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: '0.98rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65 }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* ── Key Metrics Grid ── */}
        {stats.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div data-animate style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: 'var(--text-muted)',
              fontFamily: 'var(--font-heading)', marginBottom: 14,
            }}>
              Key Metrics &amp; Facts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 16 }}>
              {stats.map((stat, i) => (
                <div data-animate key={i} style={{
                  borderRadius: 18, padding: '22px 20px',
                  background: '#ffffff',
                  border: '1px solid var(--border-med)',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                >
                  <div style={{ fontSize: 28 }}>{stat.icon || '📊'}</div>
                  <div style={{
                    fontSize: '2rem', fontWeight: 900, color: accentColor,
                    fontFamily: 'var(--font-heading)', lineHeight: 1, margin: '4px 0 2px',
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                    {stat.label}
                  </div>
                  {stat.desc && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {stat.desc}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Key Sections Grid ── */}
        {sections.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div data-animate style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: 'var(--text-muted)',
              fontFamily: 'var(--font-heading)', marginBottom: 14,
            }}>
              Core Document Sections
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {sections.map((sec, i) => {
                const c = sec.color || accentColor;
                return (
                  <div data-animate key={i} style={{
                    borderRadius: 18, padding: '22px 24px',
                    background: '#ffffff',
                    border: '1px solid var(--border-med)',
                    borderLeft: `4px solid ${c}`,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: '#f3e8ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {sec.icon || '📌'}
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                        {sec.title}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                      {sec.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Timeline / Process Flow ── */}
        {timeline.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div data-animate style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: 'var(--text-muted)',
              fontFamily: 'var(--font-heading)', marginBottom: 18,
            }}>
              Timeline &amp; Flow
            </div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{
                position: 'absolute', left: 14, top: 12, bottom: 12,
                width: 2, background: 'linear-gradient(to bottom, var(--accent), var(--pink))',
                borderRadius: 2,
              }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {timeline.map((item, i) => (
                  <div data-animate key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--accent), var(--pink))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: '#fff',
                      fontFamily: 'var(--font-heading)',
                      boxShadow: '0 2px 8px rgba(109, 40, 217, 0.3)',
                      zIndex: 1,
                    }}>
                      {item.step}
                    </div>
                    <div style={{
                      flex: 1, background: '#ffffff', borderRadius: 14,
                      padding: '16px 20px', border: '1px solid var(--border-med)',
                      boxShadow: 'var(--shadow-sm)',
                    }}>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Key Insight Quote ── */}
        {keyInsight && (
          <div data-animate style={{
            borderRadius: 18, padding: '26px 32px',
            background: '#f3e8ff',
            border: '1px solid rgba(109, 40, 217, 0.25)',
            boxShadow: '0 4px 20px rgba(109, 40, 217, 0.08)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: accentColor,
              fontFamily: 'var(--font-heading)', marginBottom: 8,
            }}>
              💡 Core Takeaway
            </div>
            <blockquote style={{
              margin: 0, fontSize: '1.08rem', fontWeight: 600,
              color: 'var(--text-primary)', lineHeight: 1.65,
              fontStyle: 'italic',
            }}>
              "{keyInsight}"
            </blockquote>
          </div>
        )}
      </div>
    </div>
  );
}
