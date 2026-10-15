import { FACES, SKIN, faceRect, mirrorTexel, texelAt, type Model, type PartId, type Rect } from './skinLayout';

/** Skin pixels: 64×64 RGBA, row by row. */
export type Pixels = Uint8ClampedArray;
export type RGBA = [number, number, number, number];

export const newPixels = () => new Uint8ClampedArray(SKIN * SKIN * 4);
const at = (x: number, y: number) => (y * SKIN + x) * 4;

export function getPx(d: Pixels, x: number, y: number): RGBA {
  const i = at(x, y);
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

export function setPx(d: Pixels, x: number, y: number, c: RGBA) {
  const i = at(x, y);
  d[i] = c[0];
  d[i + 1] = c[1];
  d[i + 2] = c[2];
  d[i + 3] = c[3];
}

export const sameColor = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

export function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

export const rgbaToHex = (c: RGBA) => `#${[c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Every pixel on a straight line, ends included (Bresenham). */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** The brush square around a pixel, kept inside the face it starts on. */
export function brush(model: Model, x: number, y: number, size: number): [number, number][] {
  const t = texelAt(model, x, y);
  if (!t) return [];
  const r = t.region.rect;
  const off = Math.floor((size - 1) / 2);
  const out: [number, number][] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const px = x - off + dx;
      const py = y - off + dy;
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) out.push([px, py]);
    }
  return out;
}

/** The pixel itself, plus its mirror image when mirroring is on. */
export function withMirror(model: Model, pts: [number, number][], mirror: boolean): [number, number][] {
  if (!mirror) return pts;
  const seen = new Set(pts.map(([x, y]) => y * SKIN + x));
  const out = [...pts];
  for (const [x, y] of pts) {
    const m = mirrorTexel(model, x, y);
    if (m && !seen.has(m[1] * SKIN + m[0])) {
      seen.add(m[1] * SKIN + m[0]);
      out.push(m);
    }
  }
  return out;
}

/**
 * Fills the patch of exactly the same color around (x, y), without leaving the face of the box it
 * starts on, so painting a face never spills over the edge onto the top of the head.
 */
export function floodFill(d: Pixels, model: Model, x: number, y: number, color: RGBA): number {
  const t = texelAt(model, x, y);
  if (!t) return 0;
  const r = t.region.rect;
  const target = getPx(d, x, y);
  if (sameColor(target, color)) return 0;
  const stack: [number, number][] = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cx < r.x || cy < r.y || cx >= r.x + r.w || cy >= r.y + r.h) continue;
    if (!sameColor(getPx(d, cx, cy), target)) continue;
    setPx(d, cx, cy, color);
    n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}

/** Lighter (amount > 0) or darker (amount < 0) version of a pixel; see-through pixels stay as they are. */
export function shade(d: Pixels, x: number, y: number, amount: number) {
  const c = getPx(d, x, y);
  if (c[3] === 0) return;
  const k = Math.abs(amount);
  const to = amount > 0 ? 255 : 0;
  setPx(d, x, y, [Math.round(c[0] + (to - c[0]) * k), Math.round(c[1] + (to - c[1]) * k), Math.round(c[2] + (to - c[2]) * k), c[3]]);
}

export type Clip = { w: number; h: number; data: Pixels };

export function copyRect(d: Pixels, r: Rect): Clip {
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) data.set(d.subarray(at(r.x, r.y + y), at(r.x + r.w, r.y + y)), y * r.w * 4);
  return { w: r.w, h: r.h, data };
}

/** Pastes with its top-left at (x, y). See-through pixels of the clip don't overwrite anything. */
export function pasteClip(d: Pixels, clip: Clip, x: number, y: number) {
  for (let cy = 0; cy < clip.h; cy++)
    for (let cx = 0; cx < clip.w; cx++) {
      const tx = x + cx;
      const ty = y + cy;
      if (tx < 0 || ty < 0 || tx >= SKIN || ty >= SKIN) continue;
      const s = (cy * clip.w + cx) * 4;
      if (clip.data[s + 3] === 0) continue;
      d.set(clip.data.subarray(s, s + 4), at(tx, ty));
    }
}

/** The colors a skin uses most, as hex, skipping see-through pixels. */
export function usedColors(d: Pixels, limit = 16): string[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => `#${k.toString(16).padStart(6, '0')}`);
}

/** A plain grey figure to start from, with the faces shaded a little so the shape reads. */
export function blankSkin(model: Model): Pixels {
  const d = newPixels();
  const tone: Record<PartId, RGBA> = {
    head: [196, 199, 204, 255],
    body: [138, 146, 160, 255],
    rightArm: [160, 166, 178, 255],
    leftArm: [160, 166, 178, 255],
    rightLeg: [96, 104, 118, 255],
    leftLeg: [96, 104, 118, 255],
  };
  const faceK: Record<string, number> = { top: 1.08, bottom: 0.8, front: 1, back: 0.9, right: 0.94, left: 0.94 };
  for (const part of Object.keys(tone) as PartId[])
    for (const face of FACES) {
      const r = faceRect(part, 'base', face, model);
      const c = tone[part].map((v, i) => (i === 3 ? v : Math.min(255, Math.round(v * faceK[face])))) as RGBA;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setPx(d, x, y, c);
    }
  return d;
}
