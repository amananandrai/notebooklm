import { useState } from 'react';

export default function DataTableViewer({ data }) {
  const [sortState, setSortState] = useState({ column: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState('');

  if (!data) return null;
  const { tableTitle, description, columns = [], rows = [], summary } = data;

  const handleSort = (col) => {
    if (sortState.column === col) {
      setSortState({ column: col, direction: sortState.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortState({ column: col, direction: 'asc' });
    }
  };

  const filteredRows = rows.filter(row => {
    if (!searchTerm) return true;
    return columns.some(col => 
      String(row[col] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortState.column) return 0;
    const valA = a[sortState.column];
    const valB = b[sortState.column];
    
    if (valA === valB) return 0;
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    
    const cmp = valA < valB ? -1 : 1;
    return sortState.direction === 'asc' ? cmp : -cmp;
  });

  const exportCsv = () => {
    if (columns.length === 0 || sortedRows.length === 0) return;
    const header = columns.join(',');
    const csvRows = sortedRows.map(row => 
      columns.map(col => {
        const val = row[col] === undefined || row[col] === null ? '' : String(row[col]);
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvData = [header, ...csvRows].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableTitle || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '24px' }}>{tableTitle}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>{description}</p>
        </div>
        <button onClick={exportCsv} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
          Export CSV
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <input 
          type="text" 
          placeholder="Search / Filter..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-med)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'var(--bg-elevated)', position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {columns.map(col => (
                <th 
                  key={col} 
                  onClick={() => handleSort(col)}
                  style={{ 
                    padding: '12px 16px', 
                    fontWeight: 700, 
                    textTransform: 'uppercase', 
                    fontSize: '11px', 
                    letterSpacing: '0.5px', 
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {col}
                    {sortState.column === col && (
                      <span style={{ color: 'var(--accent)' }}>{sortState.direction === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No matching data
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rIdx) => (
                <tr 
                  key={rIdx} 
                  style={{ 
                    background: rIdx % 2 === 1 ? 'rgba(139,92,246,0.03)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = rIdx % 2 === 1 ? 'rgba(139,92,246,0.03)' : 'transparent'}
                >
                  {columns.map(col => (
                    <td key={col} style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {summary && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-med)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Summary</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{summary}</p>
        </div>
      )}
    </div>
  );
}
