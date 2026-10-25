import { unzlibSync, zlibSync } from 'fflate';
import { hexToRgba, line, rgbaToHex, sameColor, type RGBA } from '../skinOps';

export { hexToRgba, line, rgbaToHex, sameColor, type RGBA };

/** A texture's pixels: RGBA, row by row, any size (16×16 blocks, 16×512 animations, 256×256 GUI…). */
export type Img = { w: number; h: number; data: Uint8ClampedArray };

export const blankImg = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export const cloneImg = (i: Img): Img => ({ w: i.w, h: i.h, data: new Uint8ClampedArray(i.data) });
export const sameImg = (a: Img, b: Img) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

export function getPx(img: Img, x: number, y: number): RGBA {
  const i = (y * img.w + x) * 4;
  const d = img.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

export function setPx(img: Img, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = c[3];
}

/** Part of a picture (one frame of an animation): x, y, width, height. */
export type Area = { x: number; y: number; w: number; h: number };
const inside = (a: Area, x: number, y: number) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;

/** The brush square around a pixel, kept inside `area`. */
export function brush(area: Area, x: number, y: number, size: number): [number, number][] {
  const off = Math.floor((size - 1) / 2);
  const out: [number, number][] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const px = x - off + dx;
      const py = y - off + dy;
      if (inside(area, px, py)) out.push([px, py]);
    }
  return out;
}

/** Fills the touching pixels of the same color (not diagonally) inside `area`; returns how many. */
export function floodFill(img: Img, area: Area, x: number, y: number, color: RGBA): number {
  if (!inside(area, x, y)) return 0;
  const from = getPx(img, x, y);
  if (sameColor(from, color)) return 0;
  const stack: [number, number][] = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (!inside(area, px, py) || !sameColor(getPx(img, px, py), from)) continue;
    setPx(img, px, py, color);
    n++;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return n;
}

/** Lighter (amount > 0) or darker (amount < 0) without touching see-through pixels. */
export function shadePx(img: Img, x: number, y: number, amount: number) {
  const c = getPx(img, x, y);
  if (c[3] === 0) return;
  const f = (v: number) => Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount));
  setPx(img, x, y, [f(c[0]), f(c[1]), f(c[2]), c[3]]);
}

/** The most used colors in an area, most used first (see-through pixels left out). */
export function usedColors(img: Img, area: Area, limit = 24): string[] {
  const count = new Map<string, number>();
  for (let y = area.y; y < area.y + area.h; y++)
    for (let x = area.x; x < area.x + area.w; x++) {
      const c = getPx(img, x, y);
      if (c[3] < 128) continue;
      const hex = rgbaToHex(c);
      count.set(hex, (count.get(hex) ?? 0) + 1);
    }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => hex);
}

export function copyArea(img: Img, a: Area): Img {
  const out = blankImg(a.w, a.h);
  for (let y = 0; y < a.h; y++) out.data.set(img.data.subarray(((a.y + y) * img.w + a.x) * 4, ((a.y + y) * img.w + a.x + a.w) * 4), y * a.w * 4);
  return out;
}

export function pasteArea(img: Img, part: Img, x: number, y: number) {
  for (let py = 0; py < part.h; py++) {
    const ty = y + py;
    if (ty < 0 || ty >= img.h) continue;
    for (let px = 0; px < part.w; px++) {
      const tx = x + px;
      if (tx < 0 || tx >= img.w) continue;
      const s = (py * part.w + px) * 4;
      img.data.set(part.data.subarray(s, s + 4), (ty * img.w + tx) * 4);
    }
  }
}

/** The picture at another size, each pixel copied (pixel art stays sharp). */
export function scaleNearest(img: Img, w: number, h: number): Img {
  if (w === img.w && h === img.h) return cloneImg(img);
  const out = blankImg(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y * img.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x * img.w) / w));
      const s = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return out;
}

// ---- color adjustments ----

export type Adjust = {
  /** Degrees, −180…180. */
  hue: number;
  /** −100…100 */
  saturation: number;
  brightness: number;
  contrast: number;
  /** Paint over with a color: 0…100 % of it. */
  tint: { color: string; amount: number };
  grayscale: boolean;
  invert: boolean;
};
export const NO_ADJUST: Adjust = { hue: 0, saturation: 0, brightness: 0, contrast: 0, tint: { color: '#ff5555', amount: 0 }, grayscale: false, invert: false };
export const isNoAdjust = (a: Adjust) => !a.hue && !a.saturation && !a.brightness && !a.contrast && !a.tint.amount && !a.grayscale && !a.invert;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** The picture with the adjustments applied (the original stays as it is). Only `area` changes. */
export function adjustImg(img: Img, a: Adjust, area: Area = { x: 0, y: 0, w: img.w, h: img.h }): Img {
  const out = cloneImg(img);
  const d = out.data;
  const tint = hexToRgba(a.tint.color);
  const ta = a.tint.amount / 100;
  const sat = a.saturation / 100;
  const bri = a.brightness / 100;
  const con = a.contrast / 100;
  const cf = con >= 0 ? 1 + con * 2 : 1 + con;
  for (let y = area.y; y < area.y + area.h; y++)
    for (let x = area.x; x < area.x + area.w; x++) {
      const i = (y * img.w + x) * 4;
      if (d[i + 3] === 0) continue;
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (a.hue || sat) {
        let [h, s, l] = rgbToHsl(r, g, b);
        h = (((h + a.hue / 360) % 1) + 1) % 1;
        s = Math.max(0, Math.min(1, sat > 0 ? s + (1 - s) * sat * s : s * (1 + sat)));
        [r, g, b] = hslToRgb(h, s, l);
      }
      if (a.grayscale) r = g = b = 0.299 * r + 0.587 * g + 0.114 * b;
      if (ta) {
        // Keeps the texture's light and dark: the tint color times the pixel's brightness.
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        r = r * (1 - ta) + tint[0] * lum * 1.25 * ta;
        g = g * (1 - ta) + tint[1] * lum * 1.25 * ta;
        b = b * (1 - ta) + tint[2] * lum * 1.25 * ta;
      }
      if (con) {
        r = (r - 128) * cf + 128;
        g = (g - 128) * cf + 128;
        b = (b - 128) * cf + 128;
      }
      if (bri) {
        r = bri > 0 ? r + (255 - r) * bri : r * (1 + bri);
        g = bri > 0 ? g + (255 - g) * bri : g * (1 + bri);
        b = bri > 0 ? b + (255 - b) * bri : b * (1 + bri);
      }
      if (a.invert) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  return out;
}

/** Multiplies by a color, as the game does for grass, leaves and water. */
export function multiplyImg(img: Img, hex: string): Img {
  const out = cloneImg(img);
  const [r, g, b] = hexToRgba(hex);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = (out.data[i] * r) / 255;
    out.data[i + 1] = (out.data[i + 1] * g) / 255;
    out.data[i + 2] = (out.data[i + 2] * b) / 255;
  }
  return out;
}

// ---- PNG ----

/** Width and height from a PNG's header, without decoding it. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/**
 * Exact PNG decoding (every color type, bit depths 1–16, not interlaced), so see-through pixels
 * keep their colors; a canvas would round them. Returns null for what it can't read.
 */
export function decodePng(bytes: Uint8Array): Img | null {
  const size = pngSize(bytes);
  if (!size) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let depth = 0;
  let type = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let p = 8; p + 8 <= bytes.length; ) {
    const len = v.getUint32(p);
    const name = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      depth = body[8];
      type = body[9];
      if (body[12] !== 0) return null; // interlaced
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) return null;
  let raw: Uint8Array;
  try {
    const all = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of idat) {
      all.set(c, o);
      o += c.length;
    }
    raw = unzlibSync(all);
  } catch {
    return null;
  }
  const { w, h } = size;
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  if (raw.length < (stride + 1) * h) return null;
  // Undo the per-row filters (none, sub, up, average, Paeth).
  const rows = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= bpp ? up[i - bpp] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = (src[i] + add) & 0xff;
    }
  }
  const img = blankImg(w, h);
  const d = img.data;
  const max = (1 << Math.min(depth, 8)) - 1;
  // One sample (scaled to 0…255; 16-bit keeps its high byte).
  const sample = (row: Uint8Array, n: number) => {
    if (depth === 8) return row[n];
    if (depth === 16) return row[n * 2];
    const bit = n * depth;
    return ((row[bit >> 3] >> (8 - depth - (bit & 7))) & max) * (type === 3 ? 1 : 255 / max);
  };
  const trnsGray = trns && type === 0 ? (depth === 16 ? trns[0] : ((trns[0] << 8) | trns[1]) * (255 / max)) : -1;
  // tRNS for RGB holds one 16-bit sample per channel; with 8 bits the low byte is the value.
  const trnsRgb = trns && type === 2 && trns.length >= 6 ? (depth === 16 ? [trns[0], trns[2], trns[4]] : [trns[1], trns[3], trns[5]]) : null;
  for (let y = 0; y < h; y++) {
    const row = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const s = x * channels;
      if (type === 3) {
        const k = sample(row, x);
        d[i] = palette?.[k * 3] ?? 0;
        d[i + 1] = palette?.[k * 3 + 1] ?? 0;
        d[i + 2] = palette?.[k * 3 + 2] ?? 0;
        d[i + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(row, s);
        d[i] = d[i + 1] = d[i + 2] = g;
        d[i + 3] = type === 4 ? sample(row, s + 1) : Math.round(g) === Math.round(trnsGray) ? 0 : 255;
      } else {
        d[i] = sample(row, s);
        d[i + 1] = sample(row, s + 1);
        d[i + 2] = sample(row, s + 2);
        // RGB with a tRNS chunk: that one color is see-through (the fire textures use it).
        d[i + 3] = type === 6 ? sample(row, s + 3) : trnsRgb && d[i] === trnsRgb[0] && d[i + 1] === trnsRgb[1] && d[i + 2] === trnsRgb[2] ? 0 : 255;
      }
    }
  }
  return img;
}

/** Decodes any picture (PNG from the game exactly, or a photo through the browser) into pixels. */
export async function decodeImage(src: Blob | Uint8Array): Promise<Img> {
  const bytes = src instanceof Uint8Array ? src : null;
  const exact = bytes ? decodePng(bytes) : null;
  if (exact) return exact;
  if (src instanceof Blob && (src.type === 'image/png' || /\.png$/i.test((src as File).name ?? ''))) {
    const png = decodePng(new Uint8Array(await src.arrayBuffer()));
    if (png) return png;
  }
  const blob = src instanceof Blob ? src : new Blob([src as BlobPart], { type: 'image/png' });
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const img = bitmapPixels(bmp, bmp.width, bmp.height, false);
  bmp.close();
  return img;
}

/** Draws a picture at a size: smooth (averaged, for photos) or sharp (nearest pixel, for pixel art). */
export function bitmapPixels(src: CanvasImageSource, w: number, h: number, smooth: boolean, from?: { x: number; y: number; w: number; h: number }): Img {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = smooth;
  g.imageSmoothingQuality = 'high';
  if (from) g.drawImage(src, from.x, from.y, from.w, from.h, 0, 0, w, h);
  else g.drawImage(src, 0, 0, w, h);
  return { w, h, data: g.getImageData(0, 0, w, h).data };
}

/** The pixels as an ImageData (for drawing on a canvas). */
export const toImageData = (img: Img) => new ImageData(new Uint8ClampedArray(img.data), img.w, img.h);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Exact RGBA PNG, written here rather than by a canvas: a canvas keeps colors premultiplied by
 * their transparency and would shift the colors of see-through pixels (glass, water).
 */
export function encodePng(img: Img): Uint8Array {
  const { w, h, data } = img;
  // Up to 256 colors (nearly every texture): a palette, like the game's own files, 3–4× smaller.
  const index = new Map<number, number>();
  const aligned = data.byteOffset % 4 === 0 ? data : new Uint8ClampedArray(data);
  const px32 = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h);
  for (let i = 0; i < px32.length && index.size <= 256; i++) if (!index.has(px32[i])) index.set(px32[i], index.size);
  const paletted = index.size <= 256;

  let raw: Uint8Array;
  let header: [depth: number, type: number];
  const extra: [string, Uint8Array][] = [];
  if (paletted) {
    header = [8, 3];
    raw = new Uint8Array((w + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = index.get(px32[y * w + x])!;
    const plte = new Uint8Array(index.size * 3);
    const trns = new Uint8Array(index.size);
    let lastSeeThrough = -1;
    for (let p = 0; p < px32.length; p++) {
      const i = index.get(px32[p])!;
      plte[i * 3] = data[p * 4];
      plte[i * 3 + 1] = data[p * 4 + 1];
      plte[i * 3 + 2] = data[p * 4 + 2];
      trns[i] = data[p * 4 + 3];
      if (trns[i] < 255) lastSeeThrough = Math.max(lastSeeThrough, i);
    }
    extra.push(['PLTE', plte]);
    if (lastSeeThrough >= 0) extra.push(['tRNS', trns.subarray(0, lastSeeThrough + 1)]);
  } else {
    // Fully solid pictures (photos, the menu panorama) without the alpha channel: a quarter smaller.
    let solid = true;
    for (let i = 3; i < data.length && solid; i += 4) if (data[i] !== 255) solid = false;
    const ch = solid ? 3 : 4;
    header = [8, solid ? 2 : 6];
    const stride = w * ch;
    let src: Uint8Array | Uint8ClampedArray = data;
    if (solid) {
      src = new Uint8Array(w * h * 3);
      for (let p = 0, q = 0; p < data.length; p += 4, q += 3) {
        src[q] = data[p];
        src[q + 1] = data[p + 1];
        src[q + 2] = data[p + 2];
      }
    }
    // Each row with the filter that leaves the smallest numbers (the usual PNG rule of thumb).
    raw = new Uint8Array((stride + 1) * h);
    const tries = Array.from({ length: 5 }, () => new Uint8Array(stride));
    // Big pictures (photos) just use Paeth, which nearly always wins for them, 5× faster.
    const filters = w * h > 65536 ? [4] : [0, 1, 2, 3, 4];
    for (let y = 0; y < h; y++) {
      const row = src.subarray(y * stride, (y + 1) * stride);
      const up = y ? src.subarray((y - 1) * stride, y * stride) : null;
      let best = 0;
      let bestSum = Infinity;
      for (const f of filters) {
        const out = tries[f];
        let sum = 0;
        for (let i = 0; i < stride; i++) {
          const a = i >= ch ? row[i - ch] : 0;
          const b = up ? up[i] : 0;
          const c = up && i >= ch ? up[i - ch] : 0;
          let pred = 0;
          if (f === 1) pred = a;
          else if (f === 2) pred = b;
          else if (f === 3) pred = (a + b) >> 1;
          else if (f === 4) {
            const pa = Math.abs(b - c);
            const pb = Math.abs(a - c);
            const pc = Math.abs(a + b - 2 * c);
            pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          }
          const v = (row[i] - pred) & 0xff;
          out[i] = v;
          sum += v < 128 ? v : 256 - v;
        }
        if (sum < bestSum) {
          bestSum = sum;
          best = f;
        }
      }
      raw[y * (stride + 1)] = best;
      raw.set(tries[best], y * (stride + 1) + 1);
    }
  }
  // Big pictures compress almost as well and much faster a notch lower.
  const idat = zlibSync(raw, { level: w * h > 65536 ? 6 : 9 });
  const chunks: [string, Uint8Array][] = [
    ['IHDR', (() => {
      const b = new Uint8Array(13);
      const v = new DataView(b.buffer);
      v.setUint32(0, w);
      v.setUint32(4, h);
      b[8] = header[0];
      b[9] = header[1];
      return b;
    })()],
    ...extra,
    ['IDAT', idat],
    ['IEND', new Uint8Array(0)],
  ];
  const size = 8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(out.buffer);
  let p = 8;
  for (const [type, d] of chunks) {
    v.setUint32(p, d.length);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    out.set(d, p + 8);
    v.setUint32(p + 8 + d.length, crc32(out, p + 4, p + 8 + d.length));
    p += 12 + d.length;
  }
  return out;
}
