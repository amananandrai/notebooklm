import { useEffect, useRef } from 'react';

export default function InfographicViewer({ data }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Stagger-animate all infographic elements on mount
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

  // Generate lighter versions of accent colors
  const accentAlpha = `${accentColor}22`;
  const accent2Alpha = `${accentColor2}22`;

  return (
    <div ref={containerRef} style={{
      height: '100%',
      overflowY: 'auto',
      padding: '32px 40px',
      background: 'var(--bg-main)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* ── Header Band ── */}
      <div data-animate style={{
        borderRadius: 20,
        padding: '36px 48px',
        marginBottom: 28,
        background: `linear-gradient(135deg, ${accentColor}33 0%, ${accentColor2}22 100%)`,
        border: `1px solid ${accentColor}44`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blob */}
        <div style={{
          position: 'absolute', right: -60, top: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: `${accentColor}18`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 4,
          textTransform: 'uppercase', color: accentColor, marginBottom: 12,
          fontFamily: 'var(--font-heading)',
        }}>
          📈 AI-Generated Infographic
        </div>
        <h1 style={{
          fontSize: '2rem', fontWeight: 800, color: '#fff',
          lineHeight: 1.2, margin: 0, marginBottom: 12,
          fontFamily: 'var(--font-heading)',
        }}>
          {title}
        </h1>
        <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>
          {subtitle}
        </p>
      </div>

      {/* ── Key Stats Row ── */}
      {stats.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 3,
            textTransform: 'uppercase', color: 'var(--text-muted)',
            fontFamily: 'var(--font-heading)', marginBottom: 14,
          }}>
            Key Metrics
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 14 }}>
            {stats.map((stat, i) => (
              <div data-animate key={i} style={{
                borderRadius: 16, padding: '22px 20px',
                background: `linear-gradient(135deg, ${accentColor}18, ${accentColor2}0d)`,
                border: `1px solid ${accentColor}30`,
                display: 'flex', flexDirection: 'column', gap: 6,
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${accentColor}30`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ fontSize: 28 }}>{stat.icon}</div>
                <div style={{
                  fontSize: '2rem', fontWeight: 900, color: accentColor,
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

      {/* ── Sections Grid ── */}
      {sections.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 3,
            textTransform: 'uppercase', color: 'var(--text-muted)',
            fontFamily: 'var(--font-heading)', marginBottom: 14,
          }}>
            Key Sections
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {sections.map((sec, i) => {
              const c = sec.color || accentColor;
              return (
                <div data-animate key={i} style={{
                  borderRadius: 16, padding: '24px',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${c}30`,
                  borderLeft: `4px solid ${c}`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 32px ${c}25`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: `${c}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {sec.icon}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>
                      {sec.title}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    {sec.summary}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Timeline / Flow ── */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div data-animate style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 3,
            textTransform: 'uppercase', color: 'var(--text-muted)',
            fontFamily: 'var(--font-heading)', marginBottom: 18,
          }}>
            Timeline & Flow
          </div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute', left: 15, top: 0, bottom: 0,
              width: 2, background: `linear-gradient(to bottom, ${accentColor}, ${accentColor2})`,
              borderRadius: 2,
            }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((item, i) => (
                <div data-animate key={i} style={{ display: 'flex', gap: 20, paddingBottom: i < timeline.length - 1 ? 28 : 0 }}>
                  {/* Step dot */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff',
                    fontFamily: 'var(--font-heading)',
                    boxShadow: `0 0 20px ${accentColor}60`,
                    zIndex: 1,
                    marginLeft: -7,
                  }}>
                    {item.step}
                  </div>
                  {/* Step content */}
                  <div style={{
                    flex: 1, padding: '6px 0 0',
                  }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)', marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
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
          borderRadius: 20, padding: '28px 36px',
          background: `linear-gradient(135deg, ${accentColor}22, ${accentColor2}15)`,
          border: `1px solid ${accentColor}40`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 20, top: 12,
            fontSize: 80, color: `${accentColor}25`,
            fontFamily: 'Georgia, serif', lineHeight: 1,
            userSelect: 'none',
          }}>
            "
          </div>
          <div style={{
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: 3,
            textTransform: 'uppercase', color: accentColor,
            fontFamily: 'var(--font-heading)', marginBottom: 12,
          }}>
            💡 Key Insight
          </div>
          <blockquote style={{
            margin: 0, fontSize: '1.15rem', fontWeight: 600,
            color: 'rgba(255,255,255,0.9)', lineHeight: 1.7,
            fontStyle: 'italic',
          }}>
            {keyInsight}
          </blockquote>
        </div>
      )}
    </div>
  );
}
