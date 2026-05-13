import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Stroke, StrokeTool, Whiteboard } from '../lib/types';
import { toastError } from '../ui/Toast';

/**
 * WhiteboardEditor
 *
 * A finger / pen / mouse drawing surface that re-renders to a single 2D
 * canvas. Strokes are kept in a React ref while the user is mid-drag (so
 * dragging doesn't fire a render per pointermove) and committed to local
 * state on pointerup. The committed array is debounced and PUT back to the
 * server so other family devices see the same drawing.
 *
 * Why a ref-buffer for the in-flight stroke?
 *   60Hz pointermove events × a couple of seconds of drawing creates more
 *   re-renders than React can comfortably cope with (every render copies the
 *   whole stroke list). Buffering in the ref and asking the canvas to redraw
 *   with rAF pins us to one render per stroke, not one per point.
 */
export function WhiteboardEditor({
  whiteboardId,
  onClose,
}: {
  whiteboardId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const board = useQuery({
    queryKey: ['whiteboard', whiteboardId],
    queryFn: () => api.get<{ whiteboard: Whiteboard }>(`/api/whiteboards/${whiteboardId}`),
    staleTime: 5_000,
  });

  const wb = board.data?.whiteboard;
  const [tool, setTool] = useState<StrokeTool>('pen');
  const [color, setColor] = useState('#10182B');
  const [size, setSize] = useState(4);
  const [title, setTitle] = useState('');

  // Sync the title when the board loads or another device renames it.
  useEffect(() => {
    if (wb && title === '') setTitle(wb.title);
  }, [wb, title]);

  // The committed (server-known + locally finished) strokes. The canvas reads
  // from this AND from the in-flight stroke ref to render.
  const [committed, setCommitted] = useState<Stroke[]>([]);
  const latestCommitted = useRef<Stroke[]>([]);
  useEffect(() => {
    latestCommitted.current = committed;
  }, [committed]);
  useEffect(() => {
    if (wb && !dirtyRef.current) {
      setCommitted(wb.strokesJson);
    }
    // We *deliberately* skip re-syncing when dirty — otherwise a SSE-driven
    // refetch mid-drag would erase the user's local strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb?.id]);

  const inFlight = useRef<Stroke | null>(null);
  const dirtyRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Save mutation — debounced from useEffect below.
  const save = useMutation({
    mutationFn: (strokes: Stroke[]) =>
      api.put(`/api/whiteboards/${whiteboardId}/strokes`, { strokes }),
    onSuccess: () => {
      dirtyRef.current = false;
      qc.invalidateQueries({ queryKey: ['whiteboards'] });
    },
    onError: () => toastError('Couldn’t save the board', 'We’ll retry on the next change.'),
  });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) =>
      api.patch(`/api/whiteboards/${whiteboardId}`, { title: newTitle }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whiteboards'] }),
  });

  // Debounce server writes so a fast scribble flushes once, not per stroke.
  // We also flush on unmount via the cleanup so leaving the editor doesn't
  // strand local edits.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => {
      save.mutate(committed);
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);
  useEffect(() => {
    return () => {
      if (dirtyRef.current) save.mutate(latestCommitted.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas sizing — the persisted drawing space stays at the board's logical
  // width × height, but the displayed canvas stretches to fill the available
  // editor viewport. Pointer events are mapped back to logical coords with
  // independent X/Y scale factors.
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 800, h: 500 });
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setViewport({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => {
    if (!wb) {
      return { scaleX: 1, scaleY: 1, offX: 0, offY: 0, dispW: viewport.w, dispH: viewport.h };
    }
    const dispW = Math.max(1, viewport.w);
    const dispH = Math.max(1, viewport.h);
    return {
      scaleX: dispW / wb.width,
      scaleY: dispH / wb.height,
      offX: 0,
      offY: 0,
      dispW,
      dispH,
    };
  }, [wb, viewport]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wb) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.floor(fit.dispW * dpr);
    const targetH = Math.floor(fit.dispH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    canvas.style.width = `${fit.dispW}px`;
    canvas.style.height = `${fit.dispH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * fit.scaleX, 0, 0, dpr * fit.scaleY, 0, 0);

    // Background.
    paintBackground(ctx, wb.background, wb.width, wb.height);

    const all = inFlight.current ? [...committed, inFlight.current] : committed;
    for (const s of all) drawStroke(ctx, s);
  }, [committed, fit, wb]);

  // Schedule redraws on rAF so a flurry of pointer events collapse into one
  // paint per frame. We re-schedule from the pointermove handler.
  const rafId = useRef<number | null>(null);
  const scheduleRedraw = useCallback(() => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      redraw();
    });
  }, [redraw]);
  useEffect(() => {
    redraw();
  }, [redraw]);

  // Pointer handlers: map screen → canvas coords, accumulate points, finalise
  // on pointerup.
  const toLocal = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / fit.scaleX;
    const y = (e.clientY - rect.top) / fit.scaleY;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!wb) return;
    // Ignore secondary mouse buttons.
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toLocal(e);
    if (!pt) return;
    inFlight.current = {
      tool,
      color: tool === 'highlight' ? withAlpha(color, 0.35) : color,
      size: tool === 'highlight' ? size * 4 : size,
      points: [pt],
    };
    scheduleRedraw();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!inFlight.current) return;
    const pt = toLocal(e);
    if (!pt) return;
    const last = inFlight.current.points[inFlight.current.points.length - 1];
    // Skip points that didn't move at least a pixel — keeps payload small
    // when the user holds still for a second.
    if (last && Math.abs(last[0] - pt[0]) < 0.5 && Math.abs(last[1] - pt[1]) < 0.5) return;
    inFlight.current.points.push(pt);
    scheduleRedraw();
  };
  const finishStroke = () => {
    const s = inFlight.current;
    inFlight.current = null;
    if (!s || s.points.length === 0) {
      scheduleRedraw();
      return;
    }
    // A single-tap "stroke" with one point doesn't render — synth a tiny
    // line so taps still show as a dot.
    if (s.points.length === 1) {
      const p0 = s.points[0]!;
      s.points.push([p0[0] + 0.5, p0[1] + 0.5]);
    }
    setCommitted((arr) => {
      const next = [...arr, s];
      latestCommitted.current = next;
      return next;
    });
    dirtyRef.current = true;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    finishStroke();
  };
  const onPointerCancel = () => {
    inFlight.current = null;
    scheduleRedraw();
  };

  const undo = () => {
    setCommitted((arr) => {
      if (arr.length === 0) return arr;
      const next = arr.slice(0, -1);
      latestCommitted.current = next;
      dirtyRef.current = true;
      return next;
    });
  };
  const clear = () => {
    if (committed.length === 0) return;
    latestCommitted.current = [];
    setCommitted([]);
    dirtyRef.current = true;
  };

  const colors = ['#10182B', '#DB4646', '#3253D7', '#0F6E37', '#E8B12A', '#E07E2E', '#8B5BD9'];

  if (board.isLoading) {
    return (
      <div className="grid h-full place-items-center text-ink-500">Loading whiteboard…</div>
    );
  }
  if (!wb) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card max-w-md p-6 text-center">
          <p className="font-semibold text-ink-900">Whiteboard not found</p>
          <button onClick={onClose} className="btn-secondary mt-4">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-ink-900/15 bg-cream-100/70 px-3 py-2 sm:gap-3 sm:px-5">
        <button onClick={onClose} className="btn-ghost" aria-label="Back to calendar">
          ← Back
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== wb.title) {
              renameMutation.mutate(title.trim());
            }
          }}
          className="input max-w-[260px] text-base font-semibold"
          aria-label="Whiteboard title"
        />
        <span className="text-xs text-ink-500">
          {save.isPending ? 'Saving…' : dirtyRef.current ? 'Edited' : 'Saved'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} label="Pen" glyph="✒️" />
          <ToolButton
            active={tool === 'highlight'}
            onClick={() => setTool('highlight')}
            label="Highlighter"
            glyph="🖍️"
          />
          <ToolButton
            active={tool === 'eraser'}
            onClick={() => setTool('eraser')}
            label="Eraser"
            glyph="🩹"
          />
          <div className="mx-1 h-6 w-px bg-ink-900/20" aria-hidden />
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('pen');
                }}
                className={`h-7 w-7 rounded-full ring-2 transition ${
                  color === c && tool !== 'eraser'
                    ? 'ring-ink-900 scale-110 shadow-paper-sm'
                    : 'ring-ink-900/20'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={32}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Stroke size"
            className="w-24"
          />
          <button onClick={undo} className="btn-secondary" type="button" disabled={committed.length === 0}>
            Undo
          </button>
          <button onClick={clear} className="btn-danger" type="button" disabled={committed.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        data-no-swipe="1"
        className="relative min-h-[360px] flex-1 overflow-hidden bg-cream-100"
        // Disable pinch-zoom + double-tap-zoom inside the drawing area —
        // touch input belongs to the brush, not the browser. `data-no-swipe`
        // also keeps the desktop-paging touch handler in Desktops.tsx from
        // hijacking horizontal brush motion as a "swipe to next desktop".
        style={{ touchAction: 'none' }}
      >
        <div
          className="absolute"
          style={{
            left: fit.offX,
            top: fit.offY,
            width: fit.dispW,
            height: fit.dispH,
            background: cssBackground(wb.background),
            boxShadow: '0 4px 0 rgba(16,24,43,0.45), 0 12px 30px rgba(16,24,43,0.18)',
            borderRadius: 18,
            outline: '2px solid rgba(16,24,43,0.85)',
          }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerUp}
          style={{
            position: 'absolute',
            left: fit.offX,
            top: fit.offY,
            display: 'block',
            zIndex: 1,
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  glyph,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`btn ${
        active
          ? 'bg-ink-900 text-cream-50 ring-2 ring-ink-900 shadow-paper-sm'
          : 'bg-cream-50 text-ink-900 ring-2 ring-ink-900/30 hover:bg-cream-200'
      }`}
    >
      <span aria-hidden>{glyph}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  background: string,
  w: number,
  h: number,
) {
  const fill =
    background === 'dark' ? '#10182B' : background === 'paper' ? '#FBFAF4' : '#FBFAF4';
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  if (background === 'grid') {
    ctx.strokeStyle = 'rgba(16,24,43,0.10)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (background === 'dots') {
    ctx.fillStyle = 'rgba(16,24,43,0.18)';
    for (let y = 20; y < h; y += 32) {
      for (let x = 20; x < w; x += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.size;
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
  }
  // Smooth the line by fitting a quadratic Bezier between the midpoints of
  // consecutive points. Keeps it readable at low sample rates without
  // demanding sub-pixel precision from the upstream events.
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    ctx.quadraticCurveTo(a[0], a[1], mx, my);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function withAlpha(hex: string, a: number): string {
  // Accept #RGB / #RRGGBB and append alpha. Falls back to the raw color if
  // the hex is unrecognised.
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const aa = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${aa}`;
}

function cssBackground(b: string): CSSProperties['background'] {
  if (b === 'dark') return '#10182B';
  return '#FBFAF4';
}
