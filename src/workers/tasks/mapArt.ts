import { zipSync } from 'fflate';
import { buildPalette, type PaletteEntry } from '../../lib/mc/mapColors';
import { EMPTY, buildHeights, toLitematic, toStructureNbt, type MapGrid } from '../../lib/mc/schematic';
import type { Report } from '../compute.worker';
import { decode } from './image';

export type Dither = 'none' | 'smooth' | 'ordered';

export type MapGridPayload = {
  file: File;
  mapsX: number;
  mapsY: number;
  fit: 'cover' | 'contain' | 'stretch';
  dither: Dither;
  staircase: boolean;
  skipExpensive: boolean;
  /** Staircase only: tallest the build may get. */
  maxHeight: number;
};

export type MapGridResult = MapGrid & { buildHeight: number; sourceWidth: number; sourceHeight: number };

// "Redmean" distance: cheap and much closer to perceived difference than plain RGB.
function nearest(pal: PaletteEntry[], r: number, g: number, b: number) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i];
    const rm = (r + p.r) / 2;
    const dr = r - p.r;
    const dg = g - p.g;
    const db = b - p.b;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// 4×4 Bayer matrix for ordered dithering, as offsets in -0.5..0.5.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

// Decoding a big photo is the slowest step, so keep the last one while only settings change.
let cached: { key: string; bmp: ImageBitmap } | null = null;
async function bitmapFor(file: File) {
  const key = `${file.name}|${file.size}|${file.lastModified}`;
  if (cached?.key !== key) {
    cached?.bmp.close();
    cached = { key, bmp: await decode(file) };
  }
  return cached.bmp;
}

export async function mapGrid(p: MapGridPayload, report: Report): Promise<MapGridResult> {
  const W = p.mapsX * 128;
  const H = p.mapsY * 128;
  const bmp = await bitmapFor(p.file);
  report(0.1);

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  if (p.fit === 'stretch') ctx.drawImage(bmp, 0, 0, W, H);
  else {
    const k = p.fit === 'cover' ? Math.max(W / bmp.width, H / bmp.height) : Math.min(W / bmp.width, H / bmp.height);
    const w = bmp.width * k;
    const h = bmp.height * k;
    ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  }
  const px = ctx.getImageData(0, 0, W, H).data;
  const pal = buildPalette(p.staircase, p.skipExpensive);
  const idx = new Uint8Array(W * H);
  const work = new Float32Array(W * H * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    work[j] = px[i];
    work[j + 1] = px[i + 1];
    work[j + 2] = px[i + 2];
  }

  // Staircase heights grow with every run of lighter (or darker) shades in a column. Once a column has
  // climbed or dropped for maxHeight−1 steps in a row, that direction is taken off the menu for its next
  // block, so the build never gets taller than maxHeight. 0 = any shade, 1 = no lighter, 2 = no darker.
  const limit = p.staircase ? Math.max(2, p.maxHeight) - 1 : Infinity;
  const ups = new Int16Array(W);
  const downs = new Int16Array(W);
  const allowed = [pal.map((_, i) => i), pal.flatMap((c, i) => (c.shade === 2 ? [] : [i])), pal.flatMap((c, i) => (c.shade === 0 ? [] : [i]))];
  const nearestIn = (set: number[], r: number, g: number, b: number) => {
    let best = set[0];
    let bestD = Infinity;
    for (const i of set) {
      const c = pal[i];
      const rm = (r + c.r) / 2;
      const d = (2 + rm / 256) * (r - c.r) ** 2 + 4 * (g - c.g) ** 2 + (2 + (255 - rm) / 256) * (b - c.b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const cache = new Map<number, number>();
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const spread = (x: number, y: number, er: number, eg: number, eb: number, k: number) => {
    if (x < 0 || x >= W || y >= H) return;
    const j = (y * W + x) * 3;
    work[j] += er * k;
    work[j + 1] += eg * k;
    work[j + 2] += eb * k;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (px[i * 4 + 3] < 128) {
        idx[i] = EMPTY;
        continue;
      }
      const j = i * 3;
      const o = p.dither === 'ordered' ? BAYER[(y & 3) * 4 + (x & 3)] * 40 : 0;
      const r = clamp(Math.round(work[j] + o));
      const g = clamp(Math.round(work[j + 1] + o));
      const b = clamp(Math.round(work[j + 2] + o));
      const mode = ups[x] >= limit ? 1 : downs[x] >= limit ? 2 : 0;
      const key = ((r << 16) | (g << 8) | b) + mode * 0x1000000;
      let e = cache.get(key);
      if (e === undefined) {
        e = mode ? nearestIn(allowed[mode], r, g, b) : nearest(pal, r, g, b);
        cache.set(key, e);
      }
      idx[i] = e;
      if (p.staircase) {
        // Same bookkeeping as buildHeights: level blocks continue a run, the other direction ends it.
        const s = pal[e].shade;
        if (s === 2) {
          ups[x]++;
          downs[x] = 0;
        } else if (s === 0) {
          downs[x]++;
          ups[x] = 0;
        }
      }
      if (p.dither === 'smooth') {
        // Floyd–Steinberg
        const c = pal[e];
        const er = work[j] - c.r;
        const eg = work[j + 1] - c.g;
        const eb = work[j + 2] - c.b;
        spread(x + 1, y, er, eg, eb, 7 / 16);
        spread(x - 1, y + 1, er, eg, eb, 3 / 16);
        spread(x, y + 1, er, eg, eb, 5 / 16);
        spread(x + 1, y + 1, er, eg, eb, 1 / 16);
      }
    }
    if (y % 32 === 0) report(0.1 + (y / H) * 0.85);
  }

  const grid: MapGrid = { width: W, height: H, idx, palette: pal };
  const { buildHeight } = buildHeights(grid, 0, W, 0, H, p.staircase);
  return { ...grid, buildHeight, sourceWidth: bmp.width, sourceHeight: bmp.height };
}

export type MapExportPayload = {
  grid: MapGrid;
  kind: 'litematic' | 'nbt';
  staircase: boolean;
  dataVersion: number;
  /** File-safe base name, e.g. "sunset". */
  name: string;
};

/** Builds the download. NBT gives one structure per 128×128 map (zipped when there are several). */
export async function mapExport(p: MapExportPayload, report: Report): Promise<{ name: string; blob: Blob }[]> {
  const g = p.grid;
  if (p.kind === 'litematic') {
    report(0.3);
    const data = toLitematic(g, p.staircase, p.dataVersion, p.name);
    return [{ name: `${p.name}.litematic`, blob: new Blob([data as BlobPart], { type: 'application/octet-stream' }) }];
  }
  const mapsX = g.width / 128;
  const mapsY = g.height / 128;
  const files: Record<string, Uint8Array> = {};
  for (let my = 0; my < mapsY; my++) {
    for (let mx = 0; mx < mapsX; mx++) {
      const n = my * mapsX + mx + 1;
      files[`${p.name}_${n}.nbt`] = toStructureNbt(g, mx * 128, mx * 128 + 128, my * 128, my * 128 + 128, p.staircase, p.dataVersion);
      report(n / (mapsX * mapsY));
    }
  }
  const names = Object.keys(files);
  if (names.length === 1) return [{ name: names[0], blob: new Blob([files[names[0]] as BlobPart], { type: 'application/octet-stream' }) }];
  // The .nbt files are gzipped already; store them without compressing again.
  const zip = zipSync(Object.fromEntries(names.map((n) => [n, [files[n], { level: 0 }]])));
  return [{ name: `${p.name}_nbt.zip`, blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }];
}
