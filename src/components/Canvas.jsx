import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';
import {
  addElement, updateElement, finaliseElement,
  updateElements, finaliseElements,
  eraseElement, updateRemoteElement,
  setSelectedIds, toggleSelectedId, clearSelection,
  deleteSelected, setCamera, setZoom,
} from '../store/boardSlice';
import { useSocket } from '../context/SocketContext';

// ══════════════════════════════════════════════════════════════════
// DRAWING HELPERS
// ══════════════════════════════════════════════════════════════════

function applyLineStyle(ctx, lineStyle, strokeWidth) {
  switch (lineStyle) {
    case 'dashed': ctx.setLineDash([strokeWidth * 5, strokeWidth * 3]); break;
    case 'dotted': ctx.setLineDash([strokeWidth * 1.5, strokeWidth * 3]); break;
    default:       ctx.setLineDash([]); break;
  }
}

function drawElement(ctx, element, isSelected = false) {
  const {
    type, x1, y1, x2 = x1, y2 = y1,
    strokeColor = '#ffffff',
    fillColor = 'transparent',
    strokeWidth = 2,
    lineStyle = 'solid',
    opacity = 100,
    text = '',
    points = [],
  } = element;

  ctx.save();
  ctx.globalAlpha = opacity / 100;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = strokeWidth;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  applyLineStyle(ctx, lineStyle, strokeWidth);

  const hasFill = fillColor && fillColor !== 'transparent';
  if (hasFill) ctx.fillStyle = fillColor;

  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const w = maxX - minX, h = maxY - minY;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

  switch (type) {
    case 'rectangle': {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(minX, minY, w, h, 4) : ctx.rect(minX, minY, w, h);
      if (hasFill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const rx = w / 2, ry = h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      if (hasFill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx,   minY);
      ctx.lineTo(maxX, cy);
      ctx.lineTo(cx,   maxY);
      ctx.lineTo(minX, cy);
      ctx.closePath();
      if (hasFill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(cx,   minY);
      ctx.lineTo(maxX, maxY);
      ctx.lineTo(minX, maxY);
      ctx.closePath();
      if (hasFill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(14, strokeWidth * 5);
      ctx.setLineDash([]); // always solid arrowhead
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      break;
    }
    case 'pencil': {
      if (points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        // Smooth with quadratic curves
        if (i < points.length - 1) {
          const mx = (points[i].x + points[i + 1].x) / 2;
          const my = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
        } else {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      const h = Math.abs(y2 - y1) || 40;
      const fontSize = Math.max(12, h * 0.75);
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = strokeColor;
      ctx.globalAlpha = opacity / 100;
      ctx.setLineDash([]);
      ctx.textAlign = element.textAlign || 'left';
      
      let textX = x1;
      if (element.textAlign === 'center') textX = (x1 + (x2 || x1 + 200)) / 2;
      else if (element.textAlign === 'right') textX = x2 || x1 + 200;

      const lines = text.split('\n');
      const lineH = fontSize * 1.2;
      lines.forEach((line, i) => {
        if (line) ctx.fillText(line, textX, Math.min(y1, y2) + i * lineH);
      });
      break;
    }
    default: break;
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// HIT TESTING
// ══════════════════════════════════════════════════════════════════

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isPointInElement(el, px, py) {
  const T = Math.max(8, (el.strokeWidth || 2) * 2);
  const minX = Math.min(el.x1, el.x2 ?? el.x1), maxX = Math.max(el.x1, el.x2 ?? el.x1);
  const minY = Math.min(el.y1, el.y2 ?? el.y1), maxY = Math.max(el.y1, el.y2 ?? el.y1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const hasFill = el.fillColor && el.fillColor !== 'transparent';

  switch (el.type) {
    case 'rectangle':
      if (hasFill) return px >= minX && px <= maxX && py >= minY && py <= maxY;
      return (
        (px >= minX - T && px <= maxX + T && py >= minY - T && py <= minY + T) ||
        (px >= minX - T && px <= maxX + T && py >= maxY - T && py <= maxY + T) ||
        (px >= minX - T && px <= minX + T && py >= minY && py <= maxY) ||
        (px >= maxX - T && px <= maxX + T && py >= minY && py <= maxY)
      );
    case 'ellipse': {
      const rx = (maxX - minX) / 2 || 1, ry = (maxY - minY) / 2 || 1;
      const norm = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
      return hasFill ? norm <= 1 : Math.abs(norm - 1) < 0.3;
    }
    case 'diamond': {
      const normX = Math.abs(px - cx) / ((maxX - minX) / 2 || 1);
      const normY = Math.abs(py - cy) / ((maxY - minY) / 2 || 1);
      return hasFill ? normX + normY <= 1 : Math.abs(normX + normY - 1) < 0.2;
    }
    case 'triangle': {
      // Point in triangle test
      const ax = cx, ay = minY, bx = maxX, by = maxY, bX = minX;
      const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
      const d2 = (px - bX) * (by - maxY) - (bx - bX) * (py - maxY);
      const d3 = (px - ax) * (maxY - ay) - (cx - ax) * (py - ay);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      return hasFill ? !(hasNeg && hasPos) : distToSegment(px, py, cx, minY, maxX, maxY) < T || distToSegment(px, py, maxX, maxY, minX, maxY) < T || distToSegment(px, py, minX, maxY, cx, minY) < T;
    }
    case 'line':
    case 'arrow':
      return distToSegment(px, py, el.x1, el.y1, el.x2 ?? el.x1, el.y2 ?? el.y1) < T;
    case 'pencil':
      if (!el.points || el.points.length < 2) return false;
      for (let i = 1; i < el.points.length; i++) {
        if (distToSegment(px, py, el.points[i-1].x, el.points[i-1].y, el.points[i].x, el.points[i].y) < T) return true;
      }
      return false;
    case 'text':
      const minTxtX = Math.min(el.x1, el.x2 ?? el.x1 + 200);
      const minTxtY = Math.min(el.y1, el.y2 ?? el.y1 + 40);
      const maxTxtX = Math.max(el.x1, el.x2 ?? el.x1 + 200);
      const maxTxtY = Math.max(el.y1, el.y2 ?? el.y1 + 40);
      return px >= minTxtX - T && py >= minTxtY - T && px <= maxTxtX + T && py <= maxTxtY + T;
    default:
      return px >= minX - T && px <= maxX + T && py >= minY - T && py <= maxY + T;
  }
}

function getElementsInRect(elements, r) {
  const minX = Math.min(r.x1, r.x2), maxX = Math.max(r.x1, r.x2);
  const minY = Math.min(r.y1, r.y2), maxY = Math.max(r.y1, r.y2);
  return elements.filter(el => {
    const eMinX = Math.min(el.x1, el.x2 ?? el.x1), eMaxX = Math.max(el.x1, el.x2 ?? el.x1);
    const eMinY = Math.min(el.y1, el.y2 ?? el.y1), eMaxY = Math.max(el.y1, el.y2 ?? el.y1);
    return eMinX >= minX && eMaxX <= maxX && eMinY >= minY && eMaxY <= maxY;
  });
}

function getBoundingBox(elements, ids) {
  const selected = elements.filter(e => ids.includes(e.id));
  if (selected.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  selected.forEach(el => {
    const pts = el.points || [{ x: el.x1, y: el.y1 }, { x: el.x2 ?? el.x1, y: el.y2 ?? el.y1 }];
    pts.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    minX = Math.min(minX, el.x1, el.x2 ?? el.x1);
    minY = Math.min(minY, el.y1, el.y2 ?? el.y1);
    maxX = Math.max(maxX, el.x1, el.x2 ?? el.x1);
    maxY = Math.max(maxY, el.y1, el.y2 ?? el.y1);
  });
  return { minX, minY, maxX, maxY };
}

const HANDLES = ['nw','n','ne','e','se','s','sw','w'];
function getHandlePos(bb) {
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  return {
    nw: { x: bb.minX, y: bb.minY }, n: { x: cx, y: bb.minY }, ne: { x: bb.maxX, y: bb.minY },
    e:  { x: bb.maxX, y: cy },
    se: { x: bb.maxX, y: bb.maxY }, s: { x: cx, y: bb.maxY }, sw: { x: bb.minX, y: bb.maxY },
    w:  { x: bb.minX, y: cy },
  };
}

function getHandleAtPos(bb, px, py, threshold = 10) {
  const poses = getHandlePos(bb);
  for (const h of HANDLES) {
    if (Math.abs(px - poses[h].x) <= threshold && Math.abs(py - poses[h].y) <= threshold) return h;
  }
  return null;
}

function applyResize(el, handle, dx, dy) {
  const e = { ...el, points: el.points ? el.points.map(p => ({ ...p })) : undefined };
  switch (handle) {
    case 'se': e.x2 = (e.x2 ?? e.x1) + dx; e.y2 = (e.y2 ?? e.y1) + dy; break;
    case 'sw': e.x1 += dx; e.y2 = (e.y2 ?? e.y1) + dy; break;
    case 'ne': e.x2 = (e.x2 ?? e.x1) + dx; e.y1 += dy; break;
    case 'nw': e.x1 += dx; e.y1 += dy; break;
    case 'n':  e.y1 += dy; break;
    case 's':  e.y2 = (e.y2 ?? e.y1) + dy; break;
    case 'e':  e.x2 = (e.x2 ?? e.x1) + dx; break;
    case 'w':  e.x1 += dx; break;
  }
  return e;
}

// Throttle
function throttle(fn, delay) {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last >= delay) { last = now; fn(...args); } };
}

// ══════════════════════════════════════════════════════════════════
// CANVAS COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function Canvas({ boardId }) {
  const canvasRef  = useRef(null);
  const dispatch   = useDispatch();
  const socketRef  = useSocket();

  const { elements, tool, selectedIds, strokeColor, fillColor, strokeWidth, lineStyle, opacity, camera, showGrid, textAlign } =
    useSelector(s => s.board);
  const { user } = useSelector(s => s.auth);

  // Stable refs for event handlers (avoid stale closure)
  const stateRef = useRef({});
  stateRef.current = { elements, tool, selectedIds, strokeColor, fillColor, strokeWidth, lineStyle, opacity, camera };

  // Interaction refs
  const interRef = useRef({
    action: 'none',      // 'drawing'|'moving'|'resizing'|'rubber-band'|'panning'
    drawingEl: null,
    moveStart: null,     // { x, y, snapshot: [...elements] }
    resizeHandle: null,
    rubberBand: null,    // { x1, y1, x2, y2 }
    panStart: null,      // { x, y } (screen coordinates)
  });

  // Local UI state
  const [textEditing, setTextEditing]   = useState(null); // { id, x, y }
  const [rubberBand, setRubberBand]     = useState(null);
  const [activePan, setActivePan]       = useState(null); // { dx, dy } for performance
  const [remoteCursors, setRemoteCursors] = useState({});
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const textInputRef = useRef(null);

  // ─── Canvas resize observer ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      // Trigger a re-render when container resizes
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas.parentElement || canvas);
    return () => ro.disconnect();
  }, []);

  // ─── Rendering loop ──────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, W, H);

    // Apply Camera Transform
    const camX = camera.x + (activePan?.dx || 0);
    const camY = camera.y + (activePan?.dy || 0);

    // Dot grid (panned & scaled)
    if (showGrid) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; // More visible grey
      const gap = 28 * camera.zoom;
      const offsetX = camX % gap;
      const offsetY = camY % gap;
      for (let x = offsetX; x < W; x += gap) {
        for (let y = offsetY; y < H; y += gap) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    ctx.save();
    ctx.translate(camX, camY);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw all elements
    elements.forEach(el => {
      drawElement(ctx, el, selectedIds.includes(el.id));
    });

    // Selection bounding box + resize handles
    if (selectedIds.length > 0) {
      const bb = getBoundingBox(elements, selectedIds);
      if (bb) {
        const PAD = 10;
        const bx = bb.minX - PAD, by = bb.minY - PAD;
        const bw = bb.maxX - bb.minX + PAD * 2;
        const bh = bb.maxY - bb.minY + PAD * 2;

        ctx.save();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([5 / camera.zoom, 3 / camera.zoom]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();

        // Resize handles (only for single selection)
        if (selectedIds.length === 1) {
          const paddedBb = { minX: bx, minY: by, maxX: bx + bw, maxY: by + bh };
          const poses = getHandlePos(paddedBb);
          HANDLES.forEach(h => {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#818cf8';
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(poses[h].x, poses[h].y, 5 / camera.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          });
        }

        // Group indicator badge
        const hasGroup = elements.some(e => selectedIds.includes(e.id) && e.groupId);
        if (hasGroup) {
          ctx.save();
          ctx.fillStyle = '#7C3AED';
          ctx.roundRect(bx, by - 24 / camera.zoom, 52 / camera.zoom, 18 / camera.zoom, 4 / camera.zoom);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `${11 / camera.zoom}px Inter, sans-serif`;
          ctx.fillText('GROUP', bx + 6 / camera.zoom, by - 8 / camera.zoom);
          ctx.restore();
        }
      }
    }

    // Rubber-band selection rect
    if (rubberBand) {
      ctx.save();
      ctx.fillStyle = 'rgba(129,140,248,0.08)';
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
      const rx = Math.min(rubberBand.x1, rubberBand.x2);
      const ry = Math.min(rubberBand.y1, rubberBand.y2);
      const rw = Math.abs(rubberBand.x2 - rubberBand.x1);
      const rh = Math.abs(rubberBand.y2 - rubberBand.y1);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    ctx.restore(); // Restore camera transform

  }, [elements, selectedIds, rubberBand, camera, activePan, showGrid]);

  // ─── Zoom/Pan Wheel Handling ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      const { camera } = stateRef.current;
      
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomStep = 0.02;
        const zoomDelta = e.deltaY > 0 ? -zoomStep : zoomStep;
        let newZoom = Math.min(Math.max(0.1, camera.zoom + zoomDelta), 5);
        
        // Zoom relative to cursor
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const newX = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
        const newY = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);
        
        dispatch(setCamera({ x: newX, y: newY, zoom: newZoom }));
      } else {
        // Pan
        dispatch(setCamera({
          x: camera.x - e.deltaX,
          y: camera.y - e.deltaY,
          zoom: camera.zoom
        }));
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  // ─── Socket effects ──────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;
    const onEl = (el) => dispatch(updateRemoteElement(el));
    const onCursor = ({ userId: uid, x, y, userName: uName }) =>
      setRemoteCursors(prev => ({ ...prev, [uid]: { x, y, name: uName } }));
    socket.on('element-update', onEl);
    socket.on('cursor-moved', onCursor);
    return () => { socket.off('element-update', onEl); socket.off('cursor-moved', onCursor); };
  }, [socketRef, dispatch]);

  // ─── Throttled emitters ──────────────────────────────────────────
  const emitEl = useCallback(throttle((el) => {
    const s = socketRef?.current;
    if (s && boardId) s.emit('element-update', { boardId, element: el });
  }, 30), [socketRef, boardId]);

  const emitCursor = useCallback(throttle((x, y) => {
    const s = socketRef?.current;
    if (s && boardId && user) s.emit('cursor-move', { boardId, x, y, userName: user.name, userId: user.id });
  }, 50), [socketRef, boardId, user]);

  // ─── Text commit ─────────────────────────────────────────────────
  const commitText = useCallback((id, textValue) => {
    const { elements: els } = stateRef.current;
    const el = els.find(e => e.id === id);
    if (!el) return;
    if (!textValue.trim()) {
      // Remove empty text element
      dispatch({ type: 'board/eraseElement', payload: id });
    } else {
      const updated = { ...el, text: textValue };
      dispatch(finaliseElement(updated));
      dispatch(setSelectedIds([id]));
      dispatch({ type: 'board/setTool', payload: 'selection' });
      emitEl(updated);
    }
    setTextEditing(null);
  }, [dispatch, emitEl]);

  // ─── Pointer helpers ─────────────────────────────────────────────
  const getScreenPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getPos = (e) => {
    const screen = getScreenPos(e);
    const { camera } = stateRef.current;
    return { 
      x: (screen.x - camera.x) / camera.zoom, 
      y: (screen.y - camera.y) / camera.zoom 
    };
  };

  // ─── Keyboard: Delete selected & Spacebar Pan ──────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !textEditing) {
        dispatch(deleteSelected());
      }
      if (e.code === 'Space' && !textEditing) {
        setIsSpacePressed(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [dispatch, textEditing]);

  // ─── Pointer Down ────────────────────────────────────────────────
  const onPointerDown = (e) => {
    const screenPos = getScreenPos(e);
    const { x, y } = getPos(e);
    const { tool: t, elements: els, selectedIds: selIds,
            strokeColor: sc, fillColor: fc, strokeWidth: sw, lineStyle: ls, opacity: op, camera } = stateRef.current;
    canvasRef.current.setPointerCapture(e.pointerId);

    // ── Panning ──
    if (e.button === 1 || isSpacePressed) {
      interRef.current = { action: 'panning', panStart: { screenX: screenPos.x, screenY: screenPos.y, camX: camera.x, camY: camera.y } };
      return;
    }

    if (e.button !== 0) return; // ignore right click for drawing

    // ── Eraser ──
    if (t === 'eraser') {
      const hit = [...els].reverse().find(el => isPointInElement(el, x, y));
      if (hit) dispatch(eraseElement(hit.id));
      return;
    }

    // ── Text tool: click to place textarea ──
    if (t === 'text') {
      const id = uuid();
      const newEl = { id, type: 'text', x1: x, y1: y, x2: x + 200, y2: y + 40,
        text: '', strokeColor: sc, fillColor: 'transparent', strokeWidth: sw, lineStyle: ls, opacity: op, textAlign };
      dispatch(addElement(newEl));
      setTextEditing({ id, x, y, h: 40 });
      setTimeout(() => textInputRef.current?.focus(), 30);
      return;
    }

    // ── Selection tool ──
    if (t === 'selection') {
      // Check resize handle (single selection only)
      if (selIds.length === 1) {
        const bb = getBoundingBox(els, selIds);
        if (bb) {
          const paddedBb = { minX: bb.minX - 10, minY: bb.minY - 10, maxX: bb.maxX + 10, maxY: bb.maxY + 10 };
          const handle = getHandleAtPos(paddedBb, x, y);
          if (handle) {
            interRef.current = { action: 'resizing', resizeHandle: handle, moveStart: { x, y } };
            return;
          }
        }
      }

      // Check if clicking inside selection bounding box (multiple items / group dragging)
      if (selIds.length > 0) {
        const bb = getBoundingBox(els, selIds);
        if (bb && x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY) {
           // We are clicking inside the selected area! Start dragging the selection.
           const snapshot = els.map(el => ({ ...el, points: el.points ? el.points.map(p => ({ ...p })) : undefined }));
           interRef.current = { action: 'moving', moveStart: { x, y, snapshot } };
           return;
        }
      }

      // Check if clicking on a specific element
      const hit = [...els].reverse().find(el => isPointInElement(el, x, y));
      if (hit) {
        // Expand group selection
        let idsToSelect = [hit.id];
        if (hit.groupId) idsToSelect = els.filter(el => el.groupId === hit.groupId).map(el => el.id);

        if (e.shiftKey) {
          // Toggle individual element
          const newIds = selIds.includes(hit.id)
            ? selIds.filter(id => id !== hit.id)
            : [...selIds, ...idsToSelect.filter(id => !selIds.includes(id))];
          dispatch(setSelectedIds(newIds));
        } else {
          if (!selIds.includes(hit.id)) dispatch(setSelectedIds(idsToSelect));
        }
        // Start moving
        const snapshot = els.map(el => ({ ...el, points: el.points ? el.points.map(p => ({ ...p })) : undefined }));
        interRef.current = { action: 'moving', moveStart: { x, y, snapshot } };
        return;
      }

      // Clicked empty space — start rubber-band
      if (!e.shiftKey) dispatch(clearSelection());
      interRef.current = { action: 'rubber-band', rubberBand: { x1: x, y1: y, x2: x, y2: y } };
      setRubberBand({ x1: x, y1: y, x2: x, y2: y });
      return;
    }

    // ── Drawing tools ──
    const newEl = {
      id: uuid(),
      type: t,
      x1: x, y1: y, x2: x, y2: y,
      points: t === 'pencil' ? [{ x, y }] : undefined,
      strokeColor: sc,
      fillColor: fc,
      strokeWidth: sw,
      lineStyle: ls,
      opacity: op,
      text: '',
    };
    dispatch(addElement(newEl));
    interRef.current = { action: 'drawing', drawingEl: newEl };
  };

  // ─── Pointer Move ────────────────────────────────────────────────
  const onPointerMove = (e) => {
    const screenPos = getScreenPos(e);
    const { x, y } = getPos(e);
    emitCursor(x, y);

    const { action, drawingEl, moveStart, resizeHandle, rubberBand: rb, panStart } = interRef.current;
    const { tool: t, elements: els, selectedIds: selIds, camera } = stateRef.current;

    // Panning
    if (action === 'panning' && panStart) {
      const dx = screenPos.x - panStart.screenX;
      const dy = screenPos.y - panStart.screenY;
      setActivePan({ dx, dy });
      return;
    }

    // Eraser drag
    if (t === 'eraser' && e.buttons === 1) {
      const hit = [...els].reverse().find(el => isPointInElement(el, x, y));
      if (hit) dispatch(eraseElement(hit.id));
      return;
    }

    // Rubber-band selection
    if (action === 'rubber-band') {
      const newRb = { ...rb, x2: x, y2: y };
      interRef.current.rubberBand = newRb;
      setRubberBand(newRb);
      return;
    }

    // Moving selected elements
    if (action === 'moving' && moveStart) {
      const dx = x - moveStart.x, dy = y - moveStart.y;
      const { snapshot } = moveStart;
      const updatedEls = snapshot
        .filter(el => selIds.includes(el.id))
        .map(el => ({
          ...el,
          x1: el.x1 + dx, y1: el.y1 + dy,
          x2: (el.x2 ?? el.x1) + dx, y2: (el.y2 ?? el.y1) + dy,
          points: el.points ? el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) : undefined,
        }));
      dispatch(updateElements(updatedEls));
      updatedEls.forEach(el => emitEl(el));
      return;
    }

    // Resizing
    if (action === 'resizing' && moveStart && selIds.length === 1) {
      const dx = x - moveStart.x, dy = y - moveStart.y;
      const el = els.find(e => e.id === selIds[0]);
      if (!el) return;
      const resized = applyResize(el, resizeHandle, dx, dy);
      dispatch(updateElement(resized));
      emitEl(resized);
      interRef.current.moveStart = { x, y };
      return;
    }

    // Drawing
    if (action === 'drawing' && drawingEl) {
      let updated;
      if (t === 'pencil') {
        updated = { ...drawingEl, points: [...(drawingEl.points || []), { x, y }], x2: x, y2: y };
      } else {
        // Shift constrains to square / 45deg
        let nx = x, ny = y;
        if (e.shiftKey && ['rectangle','ellipse','line','arrow'].includes(t)) {
          const dx = Math.abs(x - drawingEl.x1), dy = Math.abs(y - drawingEl.y1);
          if (['rectangle','ellipse'].includes(t)) { const s = Math.max(dx,dy); nx = drawingEl.x1 + (x > drawingEl.x1 ? s : -s); ny = drawingEl.y1 + (y > drawingEl.y1 ? s : -s); }
        }
        updated = { ...drawingEl, x2: nx, y2: ny };
      }
      dispatch(updateElement(updated));
      interRef.current.drawingEl = updated;
      emitEl(updated);
    }
  };

  // ─── Pointer Up ──────────────────────────────────────────────────
  const onPointerUp = (e) => {
    const { action, drawingEl, moveStart, resizeHandle, panStart } = interRef.current;
    const { elements: els, selectedIds: selIds, camera } = stateRef.current;

    if (action === 'panning' && panStart && activePan) {
       dispatch(setCamera({ x: panStart.camX + activePan.dx, y: panStart.camY + activePan.dy, zoom: camera.zoom }));
       setActivePan(null);
    }

    if (action === 'drawing' && drawingEl) {
      dispatch(finaliseElement(drawingEl));
      // Auto-select and revert to selection tool
      dispatch(setSelectedIds([drawingEl.id]));
      dispatch(setTool('selection'));
    }
    if (action === 'moving' && moveStart) {
      const updatedEls = els.filter(el => selIds.includes(el.id));
      dispatch(finaliseElements(updatedEls));
    }
    if (action === 'resizing' && selIds.length === 1) {
      const el = els.find(e => e.id === selIds[0]);
      if (el) dispatch(finaliseElement(el));
    }
    if (action === 'rubber-band' && interRef.current.rubberBand) {
      const rb = interRef.current.rubberBand;
      const inBox = getElementsInRect(els, rb);
      if (inBox.length > 0) {
         // also expand to groups if rubber band caught part of a group
         let expandedIds = new Set(inBox.map(e => e.id));
         inBox.forEach(el => {
           if (el.groupId) {
             els.filter(e => e.groupId === el.groupId).forEach(e => expandedIds.add(e.id));
           }
         });
         dispatch(setSelectedIds(Array.from(expandedIds)));
      }
      setRubberBand(null);
    }

    interRef.current = { action: 'none' };
  };

  // ─── Cursor style ─────────────────────────────────────────────────
  const getCursor = () => {
    if (isSpacePressed) return 'grab';
    if (interRef.current.action === 'panning') return 'grabbing';
    const t = stateRef.current.tool;
    if (t === 'eraser') return 'cell';
    if (t === 'text')   return 'text';
    if (t === 'selection') return 'default';
    return 'crosshair';
  };

  // ─── Text input font size ─────────────────────────────────────────
  const textFontSize = Math.max(12, (textEditing?.h || 40) * 0.75);
  
  // Handlers for zoom UI
  const handleZoomIn = () => dispatch(setCamera({ ...camera, zoom: Math.min(5, camera.zoom + 0.1) }));
  const handleZoomOut = () => dispatch(setCamera({ ...camera, zoom: Math.max(0.1, camera.zoom - 0.1) }));
  const handleZoomReset = () => dispatch(setCamera({ x: 0, y: 0, zoom: 1 }));

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        id="main-canvas"
        className="main-canvas"
        style={{ cursor: getCursor() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* Zoom Controls Overlay */}
      <div className="zoom-controls">
        <button onClick={handleZoomOut} title="Zoom Out" className="zoom-btn">-</button>
        <button onClick={handleZoomReset} title="Reset Zoom" className="zoom-value">{Math.round(camera.zoom * 100)}%</button>
        <button onClick={handleZoomIn} title="Zoom In" className="zoom-btn">+</button>
      </div>

      {/* Inline text editor overlay */}
      {textEditing && (
        <textarea
          ref={textInputRef}
          className="canvas-text-overlay"
          style={{
            left:     textEditing.x * camera.zoom + camera.x,
            top:      textEditing.y * camera.zoom + camera.y,
            fontSize: `${textFontSize * camera.zoom}px`,
            color:    stateRef.current.strokeColor,
            opacity:  stateRef.current.opacity / 100,
            transformOrigin: 'top left'
          }}
          placeholder="Type here…"
          rows={1}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onBlur={(e) => commitText(textEditing.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') commitText(textEditing.id, e.target.value);
          }}
        />
      )}

      {/* Remote cursors */}
      {Object.entries(remoteCursors).map(([uid, { x, y, name }]) => (
        <div key={uid} className="remote-cursor" style={{ left: x * camera.zoom + camera.x, top: y * camera.zoom + camera.y }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M2 2l14 5-6 2-2 6L2 2z" fill="#7C3AED" stroke="white" strokeWidth="1"/>
          </svg>
          <span className="remote-cursor-label">{name}</span>
        </div>
      ))}
    </div>
  );
}
