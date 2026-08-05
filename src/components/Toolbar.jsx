import { useDispatch, useSelector } from 'react-redux';
import {
  setTool, setStrokeColor, setFillColor, setStrokeWidth, setLineStyle, setOpacity,
  undo, redo, clearBoard, loadElements,
  groupSelected, ungroupSelected, deleteSelected, duplicateSelected,
  toggleGrid, setTextAlign, setCamera,
} from '../store/boardSlice';
import { getPlotMountainTemplate } from '../utils/templates';

// ── Tool definitions ────────────────────────────────────────────────────────────
const TOOL_GROUPS = [
  {
    label: 'Draw',
    tools: [
      { id: 'pencil',    label: 'Pencil',    keys: 'P', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> },
      { id: 'line',      label: 'Line',      keys: 'L', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5"/></svg> },
      { id: 'arrow',     label: 'Arrow',     keys: 'A', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/></svg> },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { id: 'rectangle', label: 'Rectangle', keys: 'R', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/></svg> },
      { id: 'ellipse',   label: 'Ellipse',   keys: 'E', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg> },
      { id: 'diamond',   label: 'Diamond',   keys: 'D', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 22 12 12 22 2 12"/></svg> },
      { id: 'triangle',  label: 'Triangle',  keys: 'T', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 3 22 21 2 21"/></svg> },
    ],
  },
  {
    label: 'Other',
    tools: [
      { id: 'text',      label: 'Text',      keys: 'X', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
      { id: 'selection', label: 'Select',    keys: 'S', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3l4 12 3-5 5 3L5 3z"/></svg> },
      { id: 'eraser',    label: 'Eraser',    keys: 'Q', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 20H7L3 16l11-11 6 6-4 4"/><line x1="6" y1="14" x2="10" y2="18"/></svg> },
    ],
  },
];

// ── Color palettes ──────────────────────────────────────────────────────────────
const STROKE_COLORS = [
  '#ffffff', '#e2e8f0', '#94a3b8', '#64748b', '#334155',
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#c084fc', '#f472b6',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#2563eb', '#7c3aed', '#db2777', '#e11d48', '#f59e0b',
];

const FILL_COLORS = [
  'transparent',
  'rgba(255,255,255,0.08)', 'rgba(148,163,184,0.15)', 'rgba(100,116,139,0.2)',
  'rgba(248,113,113,0.2)', 'rgba(251,146,60,0.2)', 'rgba(251,191,36,0.2)',
  'rgba(163,230,53,0.2)', 'rgba(52,211,153,0.2)', 'rgba(34,211,238,0.2)',
  'rgba(96,165,250,0.2)', 'rgba(129,140,248,0.2)', 'rgba(192,132,252,0.2)',
  'rgba(244,114,182,0.2)', 'rgba(254,205,211,0.2)',
  'rgba(255,255,255,0.25)', 'rgba(248,113,113,0.4)', 'rgba(96,165,250,0.4)',
  'rgba(129,140,248,0.4)', 'rgba(52,211,153,0.4)',
];

const STROKE_WIDTHS = [
  { value: 1, label: 'XS' },
  { value: 2, label: 'S' },
  { value: 4, label: 'M' },
  { value: 6, label: 'L' },
  { value: 10, label: 'XL' },
];

const LINE_STYLES = [
  { id: 'solid',  label: 'Solid',  render: '─────' },
  { id: 'dashed', label: 'Dashed', render: '- - -' },
  { id: 'dotted', label: 'Dotted', render: '· · ·' },
];

const TEXT_ALIGNS = [
  { id: 'left', label: 'Left', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
  { id: 'center', label: 'Center', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
  { id: 'right', label: 'Right', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
];

// ── Section component ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">{title}</div>
      {children}
    </div>
  );
}

// ── ColorSwatch ──────────────────────────────────────────────────────────────────
function ColorSwatch({ color, active, onClick, special }) {
  const isTransparent = color === 'transparent';
  return (
    <button
      className={`color-swatch ${active ? 'swatch-active' : ''} ${isTransparent ? 'swatch-transparent' : ''}`}
      style={isTransparent ? {} : { background: color }}
      title={isTransparent ? 'No fill' : color}
      onClick={onClick}
    >
      {isTransparent && (
        <svg width="14" height="14" viewBox="0 0 14 14">
          <line x1="1" y1="13" x2="13" y2="1" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

// ── Main Toolbar (Sidebar) ───────────────────────────────────────────────────────
export default function Toolbar() {
  const dispatch = useDispatch();
  const {
    tool, strokeColor, fillColor, strokeWidth, lineStyle, opacity, textAlign, selectedIds, elements, showGrid
  } = useSelector(s => s.board);

  const hasSelection = selectedIds.length > 0;
  const canGroup     = selectedIds.length >= 2;
  const canUngroup   = selectedIds.length > 0 && elements.some(e => selectedIds.includes(e.id) && e.groupId);

  const handleClear = () => {
    if (window.confirm('Clear the entire board? This cannot be undone.')) dispatch(clearBoard());
  };

  const handleLoadTemplate = () => {
    if (window.confirm('Load Plot Mountain Template? This will replace your current board.')) {
      dispatch(loadElements(getPlotMountainTemplate()));
      dispatch(setCamera({ x: 0, y: 0, zoom: 0.8 }));
    }
  };

  return (
    <div className="sidebar" id="toolbar">
      {/* ── TOOLS ── */}
      {TOOL_GROUPS.map(group => (
        <Section key={group.label} title={group.label}>
          <div className="tool-grid">
            {group.tools.map(t => (
              <button
                key={t.id}
                id={`tool-${t.id}`}
                title={`${t.label} (${t.keys})`}
                className={`tool-btn-sb ${tool === t.id ? 'tool-btn-sb-active' : ''}`}
                onClick={() => dispatch(setTool(t.id))}
              >
                <span className="tool-icon">{t.icon}</span>
                <span className="tool-label">{t.label}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}

      <div className="sidebar-divider" />

      {/* ── STROKE COLOR ── */}
      <Section title="Stroke Color">
        <div className="color-grid">
          {STROKE_COLORS.map(c => (
            <ColorSwatch
              key={c}
              color={c}
              active={strokeColor === c}
              onClick={() => dispatch(setStrokeColor(c))}
            />
          ))}
          <label className="color-swatch color-swatch-custom" title="Custom color">
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <circle cx="8" cy="8" r="7" fill="url(#rainbowStroke)" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
              <defs>
                <linearGradient id="rainbowStroke" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f87171"/>
                  <stop offset="33%" stopColor="#fbbf24"/>
                  <stop offset="66%" stopColor="#34d399"/>
                  <stop offset="100%" stopColor="#818cf8"/>
                </linearGradient>
              </defs>
            </svg>
            <input type="color" id="stroke-custom-color" value={strokeColor}
              onChange={e => dispatch(setStrokeColor(e.target.value))}
              className="hidden-color-input"
            />
          </label>
        </div>
        <div className="current-color-preview">
          <div className="color-preview-dot" style={{ background: strokeColor }} />
          <span>{strokeColor}</span>
        </div>
      </Section>

      {/* ── FILL COLOR ── */}
      <Section title="Fill Color">
        <div className="color-grid">
          {FILL_COLORS.map((c, i) => (
            <ColorSwatch
              key={i}
              color={c}
              active={fillColor === c}
              onClick={() => dispatch(setFillColor(c))}
            />
          ))}
          <label className="color-swatch color-swatch-custom" title="Custom fill">
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <circle cx="8" cy="8" r="7" fill="url(#rainbowFill)" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
              <defs>
                <linearGradient id="rainbowFill" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f472b6"/>
                  <stop offset="50%" stopColor="#a78bfa"/>
                  <stop offset="100%" stopColor="#60a5fa"/>
                </linearGradient>
              </defs>
            </svg>
            <input type="color" id="fill-custom-color" value={fillColor === 'transparent' ? '#7c3aed' : fillColor}
              onChange={e => dispatch(setFillColor(e.target.value))}
              className="hidden-color-input"
            />
          </label>
        </div>
        <div className="current-color-preview">
          <div className="color-preview-dot"
            style={{ background: fillColor === 'transparent' ? 'transparent' : fillColor, border: '1px solid rgba(255,255,255,0.15)' }}
          />
          <span>{fillColor === 'transparent' ? 'No fill' : fillColor}</span>
        </div>
      </Section>

      <div className="sidebar-divider" />

      {/* ── STROKE WIDTH ── */}
      <Section title="Stroke Width">
        <div className="stroke-width-row">
          {STROKE_WIDTHS.map(({ value, label }) => (
            <button
              key={value}
              id={`width-${value}`}
              title={`${label} (${value}px)`}
              className={`stroke-width-btn ${strokeWidth === value ? 'active' : ''}`}
              onClick={() => dispatch(setStrokeWidth(value))}
            >
              <div className="stroke-preview-line" style={{ height: Math.min(value * 2, 10) }} />
            </button>
          ))}
        </div>
      </Section>

      {/* ── LINE STYLE ── */}
      <Section title="Line Style">
        <div className="line-style-row">
          {LINE_STYLES.map(({ id, label, render }) => (
            <button
              key={id}
              id={`style-${id}`}
              title={label}
              className={`line-style-btn ${lineStyle === id ? 'active' : ''}`}
              onClick={() => dispatch(setLineStyle(id))}
            >
              <span className="line-style-preview" data-style={id}>{render}</span>
              <span className="line-style-label">{label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── OPACITY ── */}
      <Section title={`Opacity — ${opacity}%`}>
        <div className="opacity-row">
          <input
            type="range"
            id="opacity-slider"
            min={10} max={100} step={5}
            value={opacity}
            className="opacity-slider"
            onChange={e => dispatch(setOpacity(Number(e.target.value)))}
          />
        </div>
      </Section>

      {/* ── TEXT ALIGNMENT ── */}
      <Section title="Text Align">
        <div className="line-style-row">
          {TEXT_ALIGNS.map(({ id, label, icon }) => (
            <button
              key={id}
              title={label}
              className={`line-style-btn ${textAlign === id ? 'active' : ''}`}
              onClick={() => dispatch(setTextAlign(id))}
              style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {icon}
            </button>
          ))}
        </div>
      </Section>

      <div className="sidebar-divider" />

      {/* ── SELECTION ACTIONS ── */}
      {hasSelection && (
        <Section title={`Selection (${selectedIds.length})`}>
          <div className="action-grid">
            {canGroup && (
              <button id="group-btn" className="action-btn" title="Group selected" onClick={() => dispatch(groupSelected())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/></svg>
                Group
              </button>
            )}
            {canUngroup && (
              <button id="ungroup-btn" className="action-btn" title="Ungroup" onClick={() => dispatch(ungroupSelected())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM8 8l8 8M16 8 8 16"/></svg>
                Ungroup
              </button>
            )}
            <button id="duplicate-btn" className="action-btn" title="Duplicate (Ctrl+D)" onClick={() => dispatch(duplicateSelected())}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Duplicate
            </button>
            <button id="delete-sel-btn" className="action-btn action-btn-danger" title="Delete (Del)" onClick={() => dispatch(deleteSelected())}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              Delete
            </button>
          </div>
        </Section>
      )}

      <div className="sidebar-divider" />

      {/* ── HISTORY ── */}
      <Section title="Actions">
        <div className="action-grid">
          <button id="undo-btn" className="action-btn" title="Undo (Ctrl+Z)" onClick={() => dispatch(undo())}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
            Undo
          </button>
          <button id="redo-btn" className="action-btn" title="Redo (Ctrl+Y)" onClick={() => dispatch(redo())}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
            Redo
          </button>
          <button id="clear-btn" className="action-btn action-btn-danger" title="Clear board" onClick={handleClear}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M8 6V4h8v2"/></svg>
            Clear
          </button>
          <button id="template-btn" className="action-btn" title="Load Plot Mountain Template" onClick={handleLoadTemplate} style={{ color: '#34d399' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Template
          </button>
        </div>
      </Section>

      {/* ── SHORTCUTS HINT ── */}
      <div className="sidebar-shortcuts">
        <button id="grid-toggle-btn" className="action-btn" onClick={() => dispatch(toggleGrid())} style={{ marginBottom: '8px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
          {showGrid ? 'Hide Grid' : 'Show Grid'}
        </button>
        <div className="shortcut-row"><kbd>Shift</kbd> + drag = constrain</div>
        <div className="shortcut-row"><kbd>Del</kbd> = delete</div>
        <div className="shortcut-row"><kbd>Ctrl</kbd><kbd>Z</kbd> / <kbd>Y</kbd> = history</div>
      </div>
    </div>
  );
}
