import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { t, tx } from '../../../lib/i18n-core';
import { HANDLES, drawBox, full, move, resize, turnedSize, type Handle, type Orientation, type Rect } from './geometry';

type Drag = { mode: 'move' | 'draw' | Handle; sx: number; sy: number; start: Rect; scale: number; ax: number; ay: number };

const HANDLE_NAMES: Record<Handle, string> = {
  nw: tx('top left corner'),
  n: tx('top edge'),
  ne: tx('top right corner'),
  e: tx('right edge'),
  se: tx('bottom right corner'),
  s: tx('bottom edge'),
  sw: tx('bottom left corner'),
  w: tx('left edge'),
};

/**
 * The picture (a small copy, turned as set) with the crop box over it. The box is kept in pixels of
 * the full-size turned picture (W × H), so what's shown and what's saved always match.
 */
export function CropBox({
  bitmap,
  orient,
  W,
  H,
  rect,
  ratio,
  circle,
  onChange,
}: {
  bitmap: ImageBitmap;
  orient: Orientation;
  W: number;
  H: number;
  rect: Rect;
  ratio: number | null;
  circle: boolean;
  onChange: (r: Rect) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);

  // Draw the small copy turned and mirrored the way the worker will (turn, then mirror).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const { w, h } = turnedSize(bitmap.width, bitmap.height, orient);
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.scale(orient.mirror ? -1 : 1, 1);
    g.rotate((orient.rotate * Math.PI) / 180);
    g.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  }, [bitmap, orient]);

  /** Picture pixels per screen pixel, and the picture's corner on screen. */
  const measure = () => {
    const b = canvas.current!.getBoundingClientRect();
    return { scale: W / b.width, left: b.left, top: b.top };
  };

  const begin = (e: PointerEvent, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const m = measure();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: rect, scale: m.scale, ax: (e.clientX - m.left) * m.scale, ay: (e.clientY - m.top) * m.scale };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) * d.scale;
    const dy = (e.clientY - d.sy) * d.scale;
    if (d.mode === 'move') onChange(move(d.start, dx, dy, W, H));
    else if (d.mode === 'draw') {
      // A click without dragging doesn't throw the box away.
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) return;
      onChange(drawBox(d.ax, d.ay, d.ax + dx, d.ay + dy, ratio, W, H));
    } else onChange(resize(d.start, d.mode, dx, dy, ratio, W, H));
  };
  const end = () => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(move(rect, d[0], d[1], W, H));
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div
      className="crop-stage"
      tabIndex={0}
      role="group"
      aria-label={t('Crop area: drag to move it, drag its corners and edges to resize it, arrow keys move it (Shift for 10 px)')}
      onPointerDown={(e) => begin(e, 'draw')}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onChange(full(ratio, W, H))}
      onKeyDown={onKey}
    >
      <canvas ref={canvas} className="crop-canvas" />
      <div
        className={`crop-box${circle ? ' round' : ''}`}
        style={{ left: pct(rect.x, W), top: pct(rect.y, H), width: pct(rect.w, W), height: pct(rect.h, H) }}
        onPointerDown={(e) => begin(e, 'move')}
      >
        <span className="crop-third v1" />
        <span className="crop-third v2" />
        <span className="crop-third h1" />
        <span className="crop-third h2" />
        {HANDLES.map((h) => (
          <span key={h} className={`crop-handle ${h}`} aria-hidden onPointerDown={(e) => begin(e, h)} title={t(HANDLE_NAMES[h])} />
        ))}
      </div>
    </div>
  );
}
