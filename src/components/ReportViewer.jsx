import React from 'react';

export default function ReportViewer({ data }) {
  if (!data) return null;
  const { reportTitle, reportType, executiveSummary, keyFindings, sections, strategicRecommendations, riskAnalysis, conclusion } = data;

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header banner */}
      <div style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--accent)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '4px 8px', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{reportType}</div>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '28px', fontWeight: '800' }}>{reportTitle}</h1>
      </div>

      {/* Executive Summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--text-primary)' }}>Executive Summary</h2>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{executiveSummary}</p>
      </div>

      {/* Key Findings */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>Key Findings</h2>
        <ol style={{ margin: 0, paddingLeft: '24px', color: 'var(--text-secondary)' }}>
          {(keyFindings || []).map((finding, idx) => (
            <li key={idx} style={{ marginBottom: '12px', paddingLeft: '8px' }}>
              <span style={{ fontSize: '15px', lineHeight: 1.6 }}>{finding}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Detailed Sections */}
      {(sections || []).map((section, idx) => (
        <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-med)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--accent)' }}>{section.title}</h2>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{section.content}</p>
        </div>
      ))}

      {/* Strategic Recommendations */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>Strategic Recommendations</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {(strategicRecommendations || []).map((rec, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ color: 'var(--accent)', marginTop: '2px' }}>✓</div>
              <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{rec}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Analysis */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>Risk Analysis</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(riskAnalysis || []).map((riskItem, idx) => {
            const sevLower = riskItem.severity?.toLowerCase();
            let sevColor = 'var(--text-secondary)';
            if (sevLower === 'high') sevColor = '#ef4444';
            if (sevLower === 'medium') sevColor = '#f59e0b';
            if (sevLower === 'low') sevColor = '#10b981';
            
            return (
              <div key={idx} style={{ border: '1px solid var(--border-med)', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{riskItem.risk}</div>
                  <div style={{ background: `${sevColor}20`, color: sevColor, padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>{riskItem.severity}</div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}><strong>Mitigation:</strong> {riskItem.mitigation}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conclusion */}
      <div style={{ background: 'var(--bg-active)', border: '1px solid var(--accent-dim)', padding: '20px', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--text-primary)' }}>Conclusion</h2>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{conclusion}</p>
      </div>
    </div>
  );
}
