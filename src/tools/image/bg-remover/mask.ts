/**
 * The background remover's mask, as separate layers so every setting can still be changed later:
 * - `ai`: what the AI keeps (0 removed … 255 kept), shaped by the Edge / Strength sliders;
 * - `color`: what the colour picks keep;
 * - `erase` / `restore`: the brush, painted on top (the later stroke wins where they overlap).
 * The final alpha = min(ai, color), then erased, then restored. Pure, so it can be tested on its own.
 */

export type Pick = { x: number; y: number; r: number; g: number; b: number };
export type ColorSettings = { tolerance: number; contiguous: boolean; feather: number };
export type AiSettings = { edge: number; strength: number };

export type Layers = {
  w: number;
  h: number;
  ai: Uint8Array | null;
  color: Uint8Array | null;
  erase: Uint8Array;
  restore: Uint8Array;
};

export const newLayers = (w: number, h: number): Layers => ({ w, h, ai: null, color: null, erase: new Uint8Array(w * h), restore: new Uint8Array(w * h) });

/** The final alpha of one pixel. */
export function alphaAt(L: Layers, i: number) {
  let a = Math.min(L.ai ? L.ai[i] : 255, L.color ? L.color[i] : 255);
  a = Math.round((a * (255 - L.erase[i])) / 255);
  return a + Math.round(((255 - a) * L.restore[i]) / 255);
}

// ---- AI ----

/**
 * The AI's 1024×1024 probabilities (0…1), stretched back over the picture and shaped:
 * `edge` 0 keeps its soft edges (hair), 100 makes them hard; `strength` 0…100 moves where
 * "background" starts (higher removes more of the unsure parts).
 */
export function aiLayer(prob: Float32Array, side: number, w: number, h: number, s: AiSettings): Uint8Array {
  const out = new Uint8Array(w * h);
  const k = 1 + (s.edge / 100) * 24;
  const c = 0.2 + (s.strength / 100) * 0.6;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(side - 1, Math.max(0, ((y + 0.5) * side) / h - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(side - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(side - 1, Math.max(0, ((x + 0.5) * side) / w - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(side - 1, x0 + 1);
      const tx = fx - x0;
      const p =
        (prob[y0 * side + x0] * (1 - tx) + prob[y0 * side + x1] * tx) * (1 - ty) + (prob[y1 * side + x0] * (1 - tx) + prob[y1 * side + x1] * tx) * ty;
      const v = (p - c) * k + 0.5;
      out[y * w + x] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
  }
  return out;
}

// ---- colour ----

/** How different two colours look (cheap perceptual weighting, 0 … about 765). */
export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Tolerance 0…100 % as a distance; 100 % takes everything. */
export const toleranceDistance = (t: number) => (t / 100) * 765;

/** Flood-fill buffers, kept between calls: a 4K picture needs 80 MB of them, too much to make on every slider move. */
let buffers: { seen: Uint8Array; stack: Int32Array } | null = null;
function scratch(n: number) {
  if (!buffers || buffers.seen.length < n) buffers = { seen: new Uint8Array(n), stack: new Int32Array(n) };
  buffers.seen.fill(0, 0, n);
  return buffers;
}

/**
 * What the colour picks keep (255) and remove (0). With `contiguous`, only the area connected to
 * where each pick was clicked; otherwise every pixel of a similar colour. `feather` blurs the edge.
 */
export function colorLayer(rgba: Uint8ClampedArray, w: number, h: number, picks: Pick[], s: ColorSettings): Uint8Array {
  const keep = new Uint8Array(w * h).fill(255);
  const max = toleranceDistance(s.tolerance);
  const near = (i: number, p: Pick) => colorDistance(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], p.r, p.g, p.b) <= max;
  for (const p of picks) {
    if (!s.contiguous) {
      for (let i = 0; i < w * h; i++) if (keep[i] && near(i, p)) keep[i] = 0;
      continue;
    }
    // Flood fill (4 neighbours) from the clicked pixel through similar colours.
    const start = Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)));
    const { seen, stack } = scratch(w * h);
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const i = stack[--top];
      if (!near(i, p)) continue;
      keep[i] = 0;
      const x = i % w;
      const push = (j: number) => {
        if (!seen[j]) {
          seen[j] = 1;
          stack[top++] = j;
        }
      };
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < w * (h - 1)) push(i + w);
    }
  }
  return s.feather > 0 ? boxBlur(keep, w, h, Math.round(s.feather)) : keep;
}

/** A soft edge: the layer blurred `r` pixels (a box blur run twice looks almost like a Gaussian). */
export function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  let a: Uint8Array = src;
  for (let pass = 0; pass < 2; pass++) a = blurRows(blurCols(a, w, h, r), w, h, r);
  return a;
}
function blurRows(src: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      out[row + x] = Math.round(sum / (2 * r + 1));
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  return out;
}
function blurCols(src: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / (2 * r + 1));
      sum += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// ---- brush ----

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const emptyRect = (): Rect => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
export const growRect = (r: Rect, o: Rect) => {
  r.x0 = Math.min(r.x0, o.x0);
  r.y0 = Math.min(r.y0, o.y0);
  r.x1 = Math.max(r.x1, o.x1);
  r.y1 = Math.max(r.y1, o.y1);
};

/**
 * One dab of the brush at (cx, cy): `erase` removes, otherwise it brings the picture back. Full
 * strength inside `hardness` of the radius, fading out to the edge. Returns the changed pixels' box.
 */
export function stamp(L: Layers, cx: number, cy: number, radius: number, hardness: number, erase: boolean, before?: (rect: Rect) => void): Rect | null {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(L.w - 1, Math.ceil(cx + radius));
  const y1 = Math.min(L.h - 1, Math.ceil(cy + radius));
  if (x0 > x1 || y0 > y1) return null;
  const rect = { x0, y0, x1, y1 };
  before?.(rect);
  const on = erase ? L.erase : L.restore;
  const off = erase ? L.restore : L.erase;
  const inner = radius * Math.min(0.999, Math.max(0, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= radius) continue;
      const t = d <= inner ? 1 : 1 - (d - inner) / (radius - inner);
      const a = Math.round(t * t * (3 - 2 * t) * 255);
      const i = y * L.w + x;
      if (a > on[i]) on[i] = a;
      // The newer stroke wins: it takes back the other brush where it paints.
      off[i] = Math.round((off[i] * (255 - a)) / 255);
    }
  }
  return rect;
}

// ---- undo ----

/** The brush layers of a region, before (or after) a change. */
export type Patch = { rect: Rect; erase: Uint8Array; restore: Uint8Array };

const TILE = 64;

/** Copies of the brush tiles a stroke is about to change, taken once per tile. */
export class StrokeRecorder {
  private tiles = new Map<number, Patch>();
  constructor(private L: Layers) {}
  /** Call before changing `rect`. */
  touch(rect: Rect) {
    const L = this.L;
    const cols = Math.ceil(L.w / TILE);
    for (let ty = Math.floor(rect.y0 / TILE); ty <= Math.floor(rect.y1 / TILE); ty++)
      for (let tx = Math.floor(rect.x0 / TILE); tx <= Math.floor(rect.x1 / TILE); tx++) {
        const key = ty * cols + tx;
        if (!this.tiles.has(key)) this.tiles.set(key, copyRect(L, { x0: tx * TILE, y0: ty * TILE, x1: Math.min(L.w, (tx + 1) * TILE) - 1, y1: Math.min(L.h, (ty + 1) * TILE) - 1 }));
      }
  }
  get patches() {
    return [...this.tiles.values()];
  }
}

export function copyRect(L: Layers, rect: Rect): Patch {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  const erase = new Uint8Array(w * h);
  const restore = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const from = (rect.y0 + y) * L.w + rect.x0;
    erase.set(L.erase.subarray(from, from + w), y * w);
    restore.set(L.restore.subarray(from, from + w), y * w);
  }
  return { rect, erase, restore };
}

export function pastePatch(L: Layers, p: Patch) {
  const w = p.rect.x1 - p.rect.x0 + 1;
  for (let y = 0; y <= p.rect.y1 - p.rect.y0; y++) {
    const to = (p.rect.y0 + y) * L.w + p.rect.x0;
    L.erase.set(p.erase.subarray(y * w, y * w + w), to);
    L.restore.set(p.restore.subarray(y * w, y * w + w), to);
  }
}

/** Undo for a stroke: puts the old tiles back and returns the current ones (for redo). */
export function swapPatches(L: Layers, patches: Patch[]): Patch[] {
  const now = patches.map((p) => copyRect(L, p.rect));
  patches.forEach((p) => pastePatch(L, p));
  return now;
}

// ---- output ----

/** The box around everything that's kept (alpha above `min`), or null when nothing is. */
export function bbox(L: Layers, min = 8): Rect | null {
  const r = emptyRect();
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++)
      if (alphaAt(L, y * L.w + x) > min) {
        if (x < r.x0) r.x0 = x;
        if (x > r.x1) r.x1 = x;
        if (y < r.y0) r.y0 = y;
        if (y > r.y1) r.y1 = y;
      }
  return r.x1 < 0 ? null : r;
}

/**
 * The finished picture as RGBA: the original's colours with the mask's alpha, optionally on a
 * solid background, cut to `crop` (with `pad` pixels around it).
 */
export function composite(rgba: Uint8ClampedArray, L: Layers, opts: { background?: [number, number, number]; crop?: Rect | null; pad?: number } = {}) {
  const pad = opts.pad ?? 0;
  const c = opts.crop;
  const x0 = c ? Math.max(0, c.x0 - pad) : 0;
  const y0 = c ? Math.max(0, c.y0 - pad) : 0;
  const x1 = c ? Math.min(L.w - 1, c.x1 + pad) : L.w - 1;
  const y1 = c ? Math.min(L.h - 1, c.y1 + pad) : L.h - 1;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  const bg = opts.background;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y0 + y) * L.w + x0 + x;
      const o = (y * w + x) * 4;
      const a = alphaAt(L, i);
      if (bg) {
        for (let k = 0; k < 3; k++) out[o + k] = Math.round((rgba[i * 4 + k] * a + bg[k] * (255 - a)) / 255);
        out[o + 3] = 255;
      } else {
        out[o] = rgba[i * 4];
        out[o + 1] = rgba[i * 4 + 1];
        out[o + 2] = rgba[i * 4 + 2];
        out[o + 3] = a;
      }
    }
  return { data: out, w, h };
}
