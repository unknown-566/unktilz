import { from255, rgbToHsl, rgbToOklab, rgbToOklch, toHex, type RGB } from './color';

/** One color of a picture's palette: how much of the picture it covers (0–1) and a pixel that has it. */
export type PaletteColor = { color: RGB; share: number; at: { x: number; y: number } };
export type PaletteOrder = 'share' | 'light' | 'hue';

type V3 = [number, number, number];

/** Pixels are read from a copy at most this big on its longest side (plenty for the main colors, and fast). */
const SAMPLE = 160;
/** Colors closer than this (OKLab) are counted as one. */
const SAME = 0.03;
/** Colors covering less than this part of the picture are left out (counted with their nearest color). */
const CRUMB = 0.005;

/** A small shrunk copy of the picture to work on (the x/y of the result are in this copy's pixels). */
export function samplePixels(src: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, SAMPLE / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, sw, sh);
  return { data: ctx.getImageData(0, 0, sw, sh).data, w: sw, h: sh };
}

/** A tiny fixed random generator, so the same picture always gives the same palette. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const dist2 = (a: V3, b: V3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The main colors of a picture (RGBA pixels, row by row): k-means in OKLab, so colors that look
 * different stay apart. Transparent pixels are skipped. Fewer than `count` come back when the
 * picture has fewer distinct colors. Sorted by share.
 */
export function extractPalette(data: Uint8ClampedArray, w: number, count: number): PaletteColor[] {
  // Each distinct color once, with how many pixels have it (pictures often repeat colors a lot).
  const seen = new Map<number, number>();
  const firstAt = new Map<number, number>();
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!firstAt.has(key)) firstAt.set(key, p);
  }
  if (!seen.size) return [];

  const keys = [...seen.keys()];
  const pts: V3[] = keys.map((k) => rgbToOklab(from255((k >> 16) & 255, (k >> 8) & 255, k & 255)));
  const wts = keys.map((k) => seen.get(k)!);
  const total = wts.reduce((a, b) => a + b, 0);
  const k = Math.min(count, keys.length);

  // k-means++ start: the most common color, then each next one far from those already taken.
  const rand = rng(0x5eed);
  const centers: V3[] = [pts[wts.indexOf(Math.max(...wts))]];
  const near = pts.map((p) => dist2(p, centers[0]));
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) sum += near[i] * wts[i];
    if (sum === 0) break;
    let r = rand() * sum;
    let pick = pts.length - 1;
    for (let i = 0; i < pts.length; i++) {
      r -= near[i] * wts[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centers.push(pts[pick]);
    for (let i = 0; i < pts.length; i++) near[i] = Math.min(near[i], dist2(pts[i], pts[pick]));
  }

  const owner = new Int32Array(pts.length);
  for (let round = 0; round < 25; round++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(pts[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (owner[i] !== best) moved = true;
      owner[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const s = sums[owner[i]];
      s[0] += pts[i][0] * wts[i];
      s[1] += pts[i][1] * wts[i];
      s[2] += pts[i][2] * wts[i];
      s[3] += wts[i];
    }
    sums.forEach((s, c) => s[3] && (centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
    if (!moved && round > 0) break;
  }

  // Each group: its share and the real pixel color closest to its middle (so the hex is in the picture).
  type Group = { center: V3; weight: number; best: number; bestD: number };
  let groups: Group[] = centers.map((center) => ({ center, weight: 0, best: -1, bestD: Infinity }));
  for (let i = 0; i < pts.length; i++) {
    const g = groups[owner[i]];
    g.weight += wts[i];
    const d = dist2(pts[i], g.center);
    if (d < g.bestD) {
      g.bestD = d;
      g.best = i;
    }
  }
  groups = groups.filter((g) => g.weight > 0).sort((a, b) => b.weight - a.weight);

  // Near-duplicates join the bigger one; so do crumbs (soft edges between two colors), to the nearest one kept.
  const kept: Group[] = [];
  for (const g of groups) {
    const nearestKept = kept.reduce<Group | null>((best, x) => (!best || dist2(x.center, g.center) < dist2(best.center, g.center) ? x : best), null);
    if (nearestKept && (dist2(nearestKept.center, g.center) < SAME * SAME || g.weight / total < CRUMB)) nearestKept.weight += g.weight;
    else kept.push(g);
  }

  return kept.map((g) => {
    const key = keys[g.best];
    const p = firstAt.get(key)!;
    return {
      color: from255((key >> 16) & 255, (key >> 8) & 255, key & 255),
      share: g.weight / total,
      at: { x: p % w, y: Math.floor(p / w) },
    };
  });
}

/** The palette in the chosen order (by share as it comes, by lightness light → dark, or around the hue wheel with grays last). */
export function orderPalette(list: PaletteColor[], order: PaletteOrder): PaletteColor[] {
  const out = [...list];
  if (order === 'share') return out.sort((a, b) => b.share - a.share);
  if (order === 'light') return out.sort((a, b) => rgbToOklch(b.color)[0] - rgbToOklch(a.color)[0]);
  const gray = (c: RGB) => rgbToHsl(c)[1] < 0.08 || rgbToOklch(c)[1] < 0.02;
  return out.sort((a, b) => {
    const ga = gray(a.color);
    const gb = gray(b.color);
    if (ga !== gb) return ga ? 1 : -1;
    if (ga) return rgbToOklch(b.color)[0] - rgbToOklch(a.color)[0];
    return rgbToHsl(a.color)[0] - rgbToHsl(b.color)[0];
  });
}

export type PaletteFormat = 'hex' | 'css' | 'json' | 'tailwind';

/** The palette as text to paste into code. */
export function paletteText(colors: RGB[], format: PaletteFormat): string {
  const hex = colors.map((c) => toHex(c).toLowerCase());
  if (format === 'css') return `:root {\n${hex.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`;
  if (format === 'json') return JSON.stringify(hex, null, 2);
  if (format === 'tailwind') return `colors: {\n  palette: {\n${hex.map((h, i) => `    ${(i + 1) * 100}: '${h}',`).join('\n')}\n  },\n},`;
  return hex.join('\n');
}

/** A GIMP / Inkscape / Krita palette file (.gpl). */
export function paletteGpl(colors: RGB[], name: string): string {
  const rows = colors.map((c) => {
    const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v * 255));
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${toHex(c)}`;
  });
  return `GIMP Palette\nName: ${name.replace(/[\r\n]/g, ' ')}\nColumns: ${Math.min(colors.length, 8)}\n#\n${rows.join('\n')}\n`;
}

/** The palette as a PNG: stripes, each with its hex under it. */
export function palettePng(colors: RGB[], textColor: (c: RGB) => RGB): Promise<Blob> {
  const cw = 160;
  const h = 220;
  const c = document.createElement('canvas');
  c.width = cw * colors.length;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 18px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  colors.forEach((col, i) => {
    ctx.fillStyle = toHex(col);
    ctx.fillRect(i * cw, 0, cw, h);
    ctx.fillStyle = toHex(textColor(col));
    ctx.fillText(toHex(col), i * cw + cw / 2, h - 18);
  });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}
