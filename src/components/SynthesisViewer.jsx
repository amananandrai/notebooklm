const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)' };
const h2 = { margin: '0 0 14px 0', fontSize: '18px', color: 'var(--text-primary)' };
const body = { margin: 0, fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 };

function Section({ title, children }) {
  return (
    <section style={card}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

/** Cross-document synthesis: themes, contradictions, per-source insights. */
export default function SynthesisViewer({ data }) {
  if (!data) return null;
  const {
    synthesisTitle, documentCount, documentsAnalyzed = [], overallSynthesis,
    commonThemes = [], contradictions = [], uniqueInsights = [], recommendations = [],
  } = data;
  const count = documentCount || documentsAnalyzed.length || 0;

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--accent)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '4px 8px', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {count} {count === 1 ? 'Document' : 'Documents'} Analyzed
        </div>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '28px', fontWeight: 800 }}>{synthesisTitle || 'Cross-Document Synthesis'}</h1>
        {documentsAnalyzed.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            {documentsAnalyzed.map((d, i) => (
              <span key={i} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--border-med)', color: 'var(--text-secondary)' }}>📄 {d}</span>
            ))}
          </div>
        )}
      </header>

      {overallSynthesis && (
        <Section title="Overall Synthesis"><p style={body}>{overallSynthesis}</p></Section>
      )}

      {commonThemes.length > 0 && (
        <Section title="Common Themes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {commonThemes.map((t, i) => (
              <div key={i}>
                <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>{t.theme}</div>
                <p style={body}>{t.evidence}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {contradictions.length > 0 && (
        <Section title="Where the Sources Disagree">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {contradictions.map((c, i) => (
              <div key={i} style={{ border: '1px solid var(--border-med)', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>{c.topic}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {[['One source', c.docA], ['Another source', c.docB]].map(([label, text]) => (
                    <div key={label} style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, borderLeft: '3px solid var(--accent-dim, var(--border-med))', paddingLeft: '10px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {uniqueInsights.length > 0 && (
        <Section title="Unique Insights by Source">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {uniqueInsights.map((u, i) => (
              <div key={i}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>📄 {u.document}</div>
                <p style={{ ...body, marginTop: '4px' }}>{u.insight}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {recommendations.length > 0 && (
        <Section title="Recommendations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)' }}>✓</div>
                <div style={body}>{r}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
