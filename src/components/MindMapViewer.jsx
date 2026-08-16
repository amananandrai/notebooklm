import { useEffect, useRef, useState } from 'react';

const NODE_COLORS = {
  'Core Theme':    '#7c6cf6',
  'Fundamentals':  '#3b82f6',
  'Background':    '#22c55e',
  'Taxonomy':      '#f59e0b',
  'Concept':       '#ec4899',
  'Application':   '#06b6d4',
  'History':       '#8b5cf6',
  'Key Figure':    '#ef4444',
  'Mechanism':     '#14b8a6',
  'Feature':       '#f97316',
  default:         '#7c6cf6',
};

const COLUMN_GAP = 280;
const ROW_HEIGHT = 90;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 54;

function getColor(category) {
  return NODE_COLORS[category] || NODE_COLORS.default;
}

export default function MindMapViewer({ data }) {
  const svgRef = useRef();
  const [pos, setPos] = useState({ x: 50, y: 150, scale: 0.85 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [hoveredPath, setHoveredPath] = useState(null); // node.id to highlight its ancestral path

  // Reset collapse state when document change
  useEffect(() => {
    setCollapsed(new Set());
    setPos({ x: 50, y: 150, scale: 0.85 });
  }, [data]);

  // Toggle Collapse
  function toggleCollapse(nodeId, e) {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  // ── Layout Algorithm: Leaf Allocation Tree ───────────────────
  function getLeafCount(node) {
    if (collapsed.has(node.id) || !node.children?.length) return 1;
    return node.children.reduce((acc, child) => acc + getLeafCount(child), 0);
  }

  function computeLayout(node, x, yOffset, level, positions, edges) {
    const leafCount = getLeafCount(node);
    const nodeHeight = leafCount * ROW_HEIGHT;
    const cy = yOffset + nodeHeight / 2;

    positions[node.id] = {
      id: node.id,
      x: x,
      y: cy,
      level: level,
      node: node,
      leafCount: leafCount
    };

    if (!collapsed.has(node.id) && node.children?.length) {
      let currentY = yOffset;
      node.children.forEach(child => {
        edges.push({ from: node.id, to: child.id });
        const childLeafCount = getLeafCount(child);
        computeLayout(child, x + COLUMN_GAP, currentY, level + 1, positions, edges);
        currentY += childLeafCount * ROW_HEIGHT;
      });
    }
  }

  const positions = {};
  const edges = [];
  if (data) {
    computeLayout(data, 0, 0, 0, positions, edges);
  }

  // ── Pan and Zoom ──────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.target.closest('.mm-node-card') || e.target.closest('.mm-collapse-btn')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }

  function onMouseMove(e) {
    if (!dragging) return;
    setPos(p => ({ ...p, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  }

  function onMouseUp() {
    setDragging(false);
  }

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setPos(p => ({ ...p, scale: Math.min(2.5, Math.max(0.25, p.scale * factor)) }));
  }

  // ── Highlight path helper ─────────────────────────────────────
  function getAncestors(nodeId, currentId = data?.id, path = []) {
    if (currentId === nodeId) return [...path, nodeId];
    const node = findNodeById(data, currentId);
    if (!node?.children) return null;
    for (const child of node.children) {
      const res = getAncestors(nodeId, child.id, [...path, currentId]);
      if (res) return res;
    }
    return null;
  }

  function findNodeById(node, id) {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  const activePath = hoveredPath ? getAncestors(hoveredPath) || [] : [];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${pos.x}, ${pos.y}) scale(${pos.scale})`}>
          {/* Edges */}
          {edges.map(e => {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) return null;

            // Connect from right of parent to left of child
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y;
            const x2 = to.x;
            const y2 = to.y;

            // Cubic Bezier horizontal path
            const dx = Math.abs(x2 - x1) * 0.45;
            const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            const isHighlighted = activePath.includes(e.from) && activePath.includes(e.to);
            const color = getColor(to.node.category);

            return (
              <path
                key={`${e.from}-${e.to}`}
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={isHighlighted ? 3 : 1.8}
                strokeOpacity={isHighlighted ? 0.9 : 0.28}
                transition="stroke-width 0.2s, stroke-opacity 0.2s"
              />
            );
          })}

          {/* Nodes */}
          {Object.values(positions).map(p => {
            const isRoot = p.level === 0;
            const color = getColor(p.node.category);
            const hasChildren = p.node.children?.length > 0;
            const isCollapsed = collapsed.has(p.id);
            const isHighlighted = activePath.includes(p.id);

            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y - NODE_HEIGHT / 2})`}
                onMouseEnter={e => {
                  setHoveredPath(p.id);
                  const rect = svgRef.current.getBoundingClientRect();
                  setTooltip({
                    node: p.node,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    parentCategory: p.node.category,
                  });
                }}
                onMouseMove={e => {
                  if (tooltip) {
                    const rect = svgRef.current.getBoundingClientRect();
                    setTooltip(prev => ({
                      ...prev,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top
                    }));
                  }
                }}
                onMouseLeave={() => {
                  setHoveredPath(null);
                  setTooltip(null);
                }}
              >
                {/* Main Card */}
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="8"
                  ry="8"
                  fill="var(--bg-elevated)"
                  stroke={isHighlighted ? color : 'var(--border-med)'}
                  strokeWidth={isHighlighted ? 2.2 : 1}
                  className="mm-node-card"
                  style={{
                    cursor: 'pointer',
                    filter: isHighlighted ? `drop-shadow(0 0 6px ${color}40)` : 'none',
                    transition: 'stroke 0.25s, stroke-width 0.25s, filter 0.25s'
                  }}
                  onClick={() => {
                    // Toggle collapse on click
                    if (hasChildren) {
                      setCollapsed(prev => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    }
                  }}
                />

                {/* Left boundary accent strip */}
                <path
                  d={`M 0 4 Q 0 0 4 0 L 6 0 L 6 ${NODE_HEIGHT} L 4 ${NODE_HEIGHT} Q 0 ${NODE_HEIGHT} 0 ${NODE_HEIGHT - 4} Z`}
                  fill={color}
                />

                {/* Category Text */}
                <text
                  x="14"
                  y="18"
                  fill={color}
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="Inter, sans-serif"
                  letterSpacing="0.06em"
                  style={{ textTransform: 'uppercase' }}
                  pointerEvents="none"
                >
                  {p.node.category}
                </text>

                {/* Title / Label Text */}
                <text
                  x="14"
                  y="36"
                  fill="var(--text-primary)"
                  fontSize="12"
                  fontWeight={isRoot ? '700' : '500'}
                  fontFamily="Inter, sans-serif"
                  pointerEvents="none"
                >
                  {p.node.label.length > 22 ? p.node.label.slice(0, 20) + '...' : p.node.label}
                </text>

                {/* Expand / Collapse Button (Right handle) */}
                {hasChildren && (
                  <g
                    transform={`translate(${NODE_WIDTH}, ${NODE_HEIGHT / 2})`}
                    className="mm-collapse-btn"
                    onClick={(e) => toggleCollapse(p.id, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      r="9"
                      fill="var(--bg-elevated)"
                      stroke={color}
                      strokeWidth="1.5"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--text-primary)"
                      fontSize="10"
                      fontWeight="bold"
                      pointerEvents="none"
                      y="0.5"
                    >
                      {isCollapsed ? '+' : '-'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend & Hint */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 11,
        color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4
      }}>
        <span>💡 <strong>Click parent nodes</strong> to collapse/expand branch</span>
        <span>🔍 Scroll to zoom · Drag canvas to pan</span>
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {['+', '−', '⊙'].map((btn) => (
          <button
            key={btn}
            onClick={() => {
              if (btn === '+') setPos(p => ({ ...p, scale: Math.min(2.5, p.scale * 1.15) }));
              if (btn === '−') setPos(p => ({ ...p, scale: Math.max(0.25, p.scale * 0.85) }));
              if (btn === '⊙') setPos({ x: 50, y: 150, scale: 0.85 });
            }}
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-hi)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16,
              display: 'grid', placeItems: 'center', transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = 'var(--bg-elevated)'}
          >
            {btn}
          </button>
        ))}
      </div>

      {/* Hover Tooltip (Glassmorphism card) */}
      {tooltip && (
        <div
          className="mm-tooltip"
          style={{
            position: 'fixed',
            left: Math.min(tooltip.x + 16, window.innerWidth - 340),
            top: tooltip.y + 16,
            background: 'var(--bg-elevated)',
            border: `1.5px solid ${getColor(tooltip.node.category)}`,
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            maxWidth: '310px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: getColor(tooltip.node.category), fontWeight: 700, marginBottom: 4 }}>
            {tooltip.node.category}
          </div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
            {tooltip.node.label}
          </div>
          {tooltip.node.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {tooltip.node.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
