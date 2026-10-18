import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { layerBoxes, pickLayer, snapAngle, snapCenter, type Layer, type LayerBox, type StickerAnim } from './compose';
import { duplicate } from './Layers';

type Drag =
  | { kind: 'move'; id: string; p0: P; c0: P }
  | { kind: 'scale'; id: string; c: P; d0: number; size0: number }
  | { kind: 'rotate'; id: string; c: P; a0: number; rot0: number }
  | { kind: 'pan'; p0: P };
type P = { x: number; y: number };

/** On-screen pixels for handles and snapping, whatever size the GIF is shown at. */
const HANDLE = 11;
const KNOB = 7;
const KNOB_GAP = 26;
const SNAP = 7;

/**
 * The preview canvas with the selected layer's frame on top: drag inside to move it (it snaps to
 * the middle), drag a corner to resize, the round knob to turn (Shift: 15° steps). Clicking picks
 * the layer under the mouse; arrow keys, Delete, Ctrl+D and Ctrl+[ / ] work while it has focus.
 */
export function Stage({
  canvas,
  W,
  H,
  layers,
  stickers,
  selected,
  onSelect,
  update,
  pan,
  fontsVersion = 0,
}: {
  canvas: RefObject<HTMLCanvasElement | null>;
  W: number;
  H: number;
  layers: Layer[];
  stickers: Map<string, StickerAnim>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Changes the layers from what they are now (so fast drags don't lose steps). */
  update: (fn: (layers: Layer[]) => Layer[]) => void;
  /** Dragging the empty picture moves the crop: called with the drag in canvas pixels. */
  pan?: { start: () => void; move: (dx: number, dy: number) => void };
  /** Goes up when a font finishes loading: texts measure differently then. */
  fontsVersion?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [cursor, setCursor] = useState('default');
  const [shown, setShown] = useState(W);

  // How many canvas pixels one screen pixel is (the GIF is usually shown smaller or bigger).
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setShown(el.getBoundingClientRect().width || W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvas, W]);
  const k = W / Math.max(1, shown);

  const measure = useMemo(() => document.createElement('canvas').getContext('2d')!, []);
  const boxes = useMemo(() => layerBoxes(measure, W, H, layers, stickers), [measure, W, H, layers, stickers, fontsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = boxes.find((b) => b.id === selected) ?? null;
  const layer = layers.find((l) => l.id === selected) ?? null;

  const toCanvas = (e: PointerEvent): P => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const set = (id: string, p: Partial<Layer>) => update((ls) => ls.map((l) => (l.id === id ? ({ ...l, ...p } as Layer) : l)));

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = toCanvas(e);
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    if (handle && box && layer) {
      const c = { x: box.cx, y: box.cy };
      drag.current =
        handle === 'rotate'
          ? { kind: 'rotate', id: box.id, c, a0: angle(c, p), rot0: layer.rotation }
          : { kind: 'scale', id: box.id, c, d0: Math.max(1, dist(c, p)), size0: layer.size };
    } else {
      const id = pickLayer(boxes, p.x, p.y);
      onSelect(id);
      const b = boxes.find((x) => x.id === id);
      if (b) drag.current = { kind: 'move', id: b.id, p0: p, c0: { x: b.cx, y: b.cy } };
      else if (pan) {
        pan.start();
        drag.current = { kind: 'pan', p0: p };
      } else return;
    }
    e.preventDefault();
    wrap.current?.focus({ preventScroll: true });
    try {
      wrap.current?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    const p = toCanvas(e);
    if (!d) {
      // Show what a drag here would do.
      const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
      setCursor(handle === 'rotate' ? 'grab' : handle ? cornerCursor(handle, box?.rotation ?? 0) : pickLayer(boxes, p.x, p.y) ? 'move' : pan ? 'grab' : 'default');
      return;
    }
    if (d.kind === 'move') {
      const s = snapCenter(d.c0.x + p.x - d.p0.x, d.c0.y + p.y - d.p0.y, W, H, SNAP * k);
      setGuides({ x: s.guideX, y: s.guideY });
      set(d.id, { x: clamp(s.cx / W, -0.2, 1.2), y: clamp(s.cy / H, -0.2, 1.2) });
    } else if (d.kind === 'scale') {
      set(d.id, { size: clamp((d.size0 * dist(d.c, p)) / d.d0, 0.02, 3) });
    } else if (d.kind === 'rotate') {
      set(d.id, { rotation: snapAngle(d.rot0 + angle(d.c, p) - d.a0, e.shiftKey) });
    } else pan?.move(p.x - d.p0.x, p.y - d.p0.y);
  };

  const up = () => {
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  const key = (e: KeyboardEvent) => {
    if (!layer) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const step = (e.shiftKey ? 10 : 1) * k;
    const nudge: Record<string, P> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (nudge[e.key]) set(layer.id, { x: layer.x + nudge[e.key].x / W, y: layer.y + nudge[e.key].y / H });
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      update((ls) => ls.filter((l) => l.id !== layer.id));
      onSelect(null);
    } else if (ctrl && e.key.toLowerCase() === 'd') {
      const copy = duplicate(layer);
      update((ls) => {
        const i = ls.findIndex((l) => l.id === layer.id);
        return [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)];
      });
      onSelect(copy.id);
    } else if (ctrl && (e.key === ']' || e.key === '[')) {
      update((ls) => {
        const i = ls.findIndex((l) => l.id === layer.id);
        const j = i + (e.key === ']' ? 1 : -1);
        if (j < 0 || j >= ls.length) return ls;
        const next = [...ls];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    } else if (e.key === 'Escape') onSelect(null);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={wrap}
      className="gm-canvas-wrap"
      tabIndex={0}
      style={{ cursor: drag.current?.kind === 'pan' ? 'grabbing' : cursor }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      aria-label="GIF preview. Click a text or sticker to select it; drag to move, corners to resize, the round handle to turn."
    >
      <canvas ref={canvas} className="gm-canvas" width={W} height={H} />
      <svg className="gm-handles" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {guides.x && <line x1={W / 2} y1={0} x2={W / 2} y2={H} className="gm-guide" strokeWidth={1.5 * k} />}
        {guides.y && <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="gm-guide" strokeWidth={1.5 * k} />}
        {box && <Frame b={box} k={k} />}
      </svg>
    </div>
  );
}

function Frame({ b, k }: { b: LayerBox; k: number }) {
  const x0 = b.cx - b.w / 2;
  const y0 = b.cy - b.h / 2;
  const hs = HANDLE * k;
  const corners: [string, number, number][] = [
    ['nw', x0, y0],
    ['ne', x0 + b.w, y0],
    ['sw', x0, y0 + b.h],
    ['se', x0 + b.w, y0 + b.h],
  ];
  const knobY = y0 - KNOB_GAP * k;
  return (
    <g transform={`rotate(${b.rotation} ${b.cx} ${b.cy})`}>
      <rect x={x0} y={y0} width={b.w} height={b.h} className="gm-frame-shadow" strokeWidth={3 * k} />
      <rect x={x0} y={y0} width={b.w} height={b.h} className="gm-frame" strokeWidth={1.5 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
      <line x1={b.cx} y1={y0} x2={b.cx} y2={knobY} className="gm-frame" strokeWidth={1.5 * k} />
      <circle cx={b.cx} cy={knobY} r={KNOB * k} className="gm-knob" strokeWidth={1.5 * k} data-handle="rotate" />
      {corners.map(([id, x, y]) => (
        <rect key={id} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} rx={2 * k} className="gm-corner" strokeWidth={1.5 * k} data-handle={id} />
      ))}
    </g>
  );
}

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (c: P, p: P) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The resize cursor pointing the way a (turned) corner moves. */
function cornerCursor(corner: string, rotation: number) {
  const base = corner === 'nw' || corner === 'se' ? 45 : 135;
  const a = (((base + rotation) % 180) + 180) % 180;
  return a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nwse-resize' : a < 112.5 ? 'ns-resize' : 'nesw-resize';
}
