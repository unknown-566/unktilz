// Crop box maths, in pixels of the picture as it's shown (after turning and mirroring). No React,
// so the tests run it directly.

export type Rect = { x: number; y: number; w: number; h: number };
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** Turned clockwise by `rotate`, then mirrored left–right when `mirror` (the order the worker uses). */
export type Orientation = { rotate: 0 | 90 | 180 | 270; mirror: boolean };

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 1;

const norm = (deg: number) => ((((deg % 360) + 360) % 360) as Orientation['rotate']);

/** The picture's size once turned. */
export const turnedSize = (w: number, h: number, o: Orientation) => (o.rotate % 180 ? { w: h, h: w } : { w, h });

/** Keeps a box inside the picture and at least 1 px big. */
export function clamp(r: Rect, W: number, H: number): Rect {
  const w = Math.max(MIN, Math.min(W, r.w));
  const h = Math.max(MIN, Math.min(H, r.h));
  return { x: Math.max(0, Math.min(W - w, r.x)), y: Math.max(0, Math.min(H - h, r.y)), w, h };
}

/** Whole pixels, still inside the picture. */
export function rounded(r: Rect, W: number, H: number): Rect {
  const x = Math.max(0, Math.min(W - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(H - 1, Math.round(r.y)));
  return { x, y, w: Math.max(1, Math.min(W - x, Math.round(r.w))), h: Math.max(1, Math.min(H - y, Math.round(r.h))) };
}

/** The biggest box with this ratio (width / height) around the same middle that fits the picture. */
export function fitRatio(r: Rect, ratio: number | null, W: number, H: number): Rect {
  if (!ratio) return clamp(r, W, H);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  // Keep the area roughly, then shrink to fit.
  let w = Math.sqrt(r.w * r.h * ratio);
  let h = w / ratio;
  const k = Math.min(1, W / w, H / h);
  w *= k;
  h *= k;
  return clamp({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H);
}

/** The whole picture, or the biggest centred box with the ratio. */
export function full(ratio: number | null, W: number, H: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: W, h: H };
  const w = Math.min(W, H * ratio);
  const h = w / ratio;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** A box that starts around 80 % of the picture: easy to see and to grab. */
export function startBox(ratio: number | null, W: number, H: number): Rect {
  const f = full(ratio, W, H);
  return { x: f.x + f.w * 0.1, y: f.y + f.h * 0.1, w: f.w * 0.8, h: f.h * 0.8 };
}

export function move(r: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return clamp({ ...r, x: r.x + dx, y: r.y + dy }, W, H);
}

/**
 * Drags a handle of the box `r0` by (dx, dy). The opposite corner or side stays put; with a ratio,
 * a side handle grows the box evenly around its middle the other way, and the box shrinks to stay
 * inside the picture.
 */
export function resize(r0: Rect, handle: Handle, dx: number, dy: number, ratio: number | null, W: number, H: number): Rect {
  const left = r0.x, top = r0.y, right = r0.x + r0.w, bottom = r0.y + r0.h;
  const hasE = handle.includes('e'), hasW = handle.includes('w'), hasN = handle.includes('n'), hasS = handle.includes('s');

  if (!ratio) {
    let x1 = left, y1 = top, x2 = right, y2 = bottom;
    if (hasW) x1 = Math.max(0, Math.min(right - MIN, left + dx));
    if (hasE) x2 = Math.min(W, Math.max(left + MIN, right + dx));
    if (hasN) y1 = Math.max(0, Math.min(bottom - MIN, top + dy));
    if (hasS) y2 = Math.min(H, Math.max(top + MIN, bottom + dy));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // Wanted size from the pointer, then the ratio, then the room there is.
  let w = r0.w + (hasE ? dx : hasW ? -dx : 0);
  let h = r0.h + (hasS ? dy : hasN ? -dy : 0);
  const corner = (hasE || hasW) && (hasN || hasS);
  if (corner) {
    // Follow whichever way the pointer moved more.
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
  } else if (hasE || hasW) h = w / ratio;
  else w = h * ratio;
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);

  // Room: from the fixed side to the edge; a side handle grows the other way around the middle.
  const cx = left + r0.w / 2, cy = top + r0.h / 2;
  const roomW = hasE ? W - left : hasW ? right : 2 * Math.min(cx, W - cx);
  const roomH = hasS ? H - top : hasN ? bottom : 2 * Math.min(cy, H - cy);
  const k = Math.min(1, roomW / w, roomH / h);
  w *= k;
  h *= k;

  const x = hasE ? left : hasW ? right - w : cx - w / 2;
  const y = hasS ? top : hasN ? bottom - h : cy - h / 2;
  return clamp({ x, y, w, h }, W, H);
}

/** A new box dragged out from point a to point b (with the ratio, b sets the bigger side). */
export function drawBox(ax: number, ay: number, bx: number, by: number, ratio: number | null, W: number, H: number): Rect {
  const px = Math.max(0, Math.min(W, ax)), py = Math.max(0, Math.min(H, ay));
  let w = Math.abs(bx - px), h = Math.abs(by - py);
  const sx = bx >= px ? 1 : -1, sy = by >= py ? 1 : -1;
  // Room from the start point towards where the pointer went.
  const roomW = sx > 0 ? W - px : px, roomH = sy > 0 ? H - py : py;
  if (ratio) {
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
    const k = Math.min(1, roomW / Math.max(w, MIN), roomH / Math.max(h, MIN));
    w *= k;
    h *= k;
  } else {
    w = Math.min(w, roomW);
    h = Math.min(h, roomH);
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  return clamp({ x: sx > 0 ? px : px - w, y: sy > 0 ? py : py - h, w, h }, W, H);
}

// ---- turning and mirroring: the box follows the picture ----

/** Box after the shown picture (W × H) is turned a quarter clockwise (+1) or anticlockwise (−1). */
export function turnBox(r: Rect, W: number, H: number, dir: 1 | -1): Rect {
  return dir === 1 ? { x: H - (r.y + r.h), y: r.x, w: r.h, h: r.w } : { x: r.y, y: W - (r.x + r.w), w: r.h, h: r.w };
}

export const mirrorBoxH = (r: Rect, W: number): Rect => ({ ...r, x: W - (r.x + r.w) });
export const mirrorBoxV = (r: Rect, H: number): Rect => ({ ...r, y: H - (r.y + r.h) });

/**
 * The orientation after one more step, as seen on screen. Mirroring then turning clockwise is the
 * same as turning anticlockwise then mirroring, and a top–bottom flip is a half turn plus a
 * left–right mirror, so every result stays "turn, then maybe mirror" (what the worker does).
 */
export function step(o: Orientation, action: 'cw' | 'ccw' | 'h' | 'v'): Orientation {
  if (action === 'h') return { rotate: o.rotate, mirror: !o.mirror };
  if (action === 'v') return { rotate: norm(o.rotate + 180), mirror: !o.mirror };
  const turn = action === 'cw' ? 90 : -90;
  return { rotate: norm(o.rotate + (o.mirror ? -turn : turn)), mirror: o.mirror };
}

// ---- the same crop for every picture ----

export const toRelative = (r: Rect, W: number, H: number) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });

/** A box given as parts of the picture, on a picture of another size (and the ratio kept, when set). */
export function fromRelative(rel: Rect, W: number, H: number, ratio: number | null): Rect {
  const r = clamp({ x: rel.x * W, y: rel.y * H, w: rel.w * W, h: rel.h * H }, W, H);
  return ratio ? fitRatio(r, ratio, W, H) : r;
}

// ---- ratios ----

export type RatioId = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '21:9' | '4:5' | 'a4' | 'custom';

/** Width / height as the ratio is written (4:3, A4 standing up); `swapped` turns it the other way. */
export function ratioOf(id: RatioId, swapped: boolean, W: number, H: number, custom: { w: number; h: number }): number | null {
  let r: number;
  if (id === 'free') return null;
  if (id === 'original') r = W / H;
  else if (id === 'a4') r = 210 / 297;
  else if (id === 'custom') r = custom.w > 0 && custom.h > 0 ? custom.w / custom.h : 1;
  else {
    const [a, b] = id.split(':').map(Number);
    r = a / b;
  }
  return swapped ? 1 / r : r;
}

/** The size the result will have: the box, or exactly w × h. */
export function outputSize(r: Rect, exact: { w: number; h: number } | null): { w: number; h: number } {
  if (!exact) return { w: Math.round(r.w), h: Math.round(r.h) };
  const w = Math.round(exact.w), h = Math.round(exact.h);
  if (w > 0 && h > 0) return { w, h };
  // One side 0: worked out from the other with the box's shape.
  if (w > 0) return { w, h: Math.max(1, Math.round((w * r.h) / r.w)) };
  if (h > 0) return { w: Math.max(1, Math.round((h * r.w) / r.h)), h };
  return { w: Math.round(r.w), h: Math.round(r.h) };
}
