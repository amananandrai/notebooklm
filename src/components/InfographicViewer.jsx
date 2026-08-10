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
    accentColor = '#6366f1',
    accentColor2 = '#8b5cf6',
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
      background: 'var(--bg-main)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* ── Header Band with AI Hero Image ── */}
        <div data-animate style={{
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 28,
          border: `1px solid ${accentColor}44`,
          background: `linear-gradient(135deg, ${accentColor}25 0%, ${accentColor2}15 100%)`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          position: 'relative',
        }}>
          {/* AI Generated Hero Graphic */}
          {heroImage && (
            <div style={{
              width: '100%',
              height: 180,
              background: `url(${heroImage}) center/cover no-repeat`,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(13,13,26,0.3) 0%, rgba(13,13,26,0.95) 100%)',
              }} />
            </div>
          )}

          <div style={{ padding: heroImage ? '0px 40px 32px' : '36px 40px', position: 'relative', marginTop: heroImage ? -40 : 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 4,
              textTransform: 'uppercase', color: accentColor, marginBottom: 8,
              fontFamily: 'var(--font-heading)',
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 20,
              background: `${accentColor}20`,
              border: `1px solid ${accentColor}40`,
            }}>
              📈 AI Infographic Overview
            </div>
            <h1 style={{
              fontSize: '2.1rem', fontWeight: 800, color: '#fff',
              lineHeight: 1.2, margin: '6px 0 10px',
              fontFamily: 'var(--font-heading)',
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6 }}>
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
              Key Metrics & Facts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 14 }}>
              {stats.map((stat, i) => (
                <div data-animate key={i} style={{
                  borderRadius: 16, padding: '20px 18px',
                  background: `linear-gradient(135deg, ${accentColor}18, ${accentColor2}0d)`,
                  border: `1px solid ${accentColor}30`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${accentColor}30`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}
                >
                  <div style={{ fontSize: 26 }}>{stat.icon || '📊'}</div>
                  <div style={{
                    fontSize: '1.9rem', fontWeight: 900, color: accentColor,
                    fontFamily: 'var(--font-heading)', lineHeight: 1,
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>
                    {stat.label}
                  </div>
                  {stat.desc && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
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
                    borderRadius: 16, padding: '22px 24px',
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${c}30`,
                    borderLeft: `4px solid ${c}`,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 32px ${c}25`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${c}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {sec.icon || '📌'}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>
                        {sec.title}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
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
              Timeline & Flow
            </div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{
                position: 'absolute', left: 14, top: 12, bottom: 12,
                width: 2, background: `linear-gradient(to bottom, ${accentColor}, ${accentColor2})`,
                borderRadius: 2,
              }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {timeline.map((item, i) => (
                  <div data-animate key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: '#fff',
                      fontFamily: 'var(--font-heading)',
                      boxShadow: `0 0 16px ${accentColor}60`,
                      zIndex: 1,
                    }}>
                      {item.step}
                    </div>
                    <div style={{
                      flex: 1, background: 'var(--bg-elevated)', borderRadius: 12,
                      padding: '14px 18px', border: '1px solid var(--border-color)',
                    }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)', marginBottom: 3 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
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
            borderRadius: 18, padding: '24px 32px',
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor2}12)`,
            border: `1px solid ${accentColor}35`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: accentColor,
              fontFamily: 'var(--font-heading)', marginBottom: 8,
            }}>
              💡 Core Takeaway
            </div>
            <blockquote style={{
              margin: 0, fontSize: '1.05rem', fontWeight: 600,
              color: 'rgba(255,255,255,0.92)', lineHeight: 1.65,
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
