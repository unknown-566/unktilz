import type { Report } from '../compute.worker';
import { equirectToFaces } from '../../lib/mc/pack/panorama';
import { bitmapPixels, encodePng, type Img } from '../../lib/mc/pack/pixels';
import { t } from '../../lib/i18n-core';

export type PanoramaPayload =
  /** One 360° picture → all six sides. */
  | { kind: 'whole'; file: Blob; size: number }
  /** Pictures for some sides (`slots` says which), each cut to a square in its middle. */
  | { kind: 'faces'; files: Blob[]; slots: number[]; size: number };
export type PanoramaResult = { pngs: (Uint8Array | null)[]; ratio: number };

/** Big photos are scaled down to this width first; more detail than that never reaches a side. */
const MAX_SOURCE = 8192;

/** The menu background's six PNGs, made off the page's thread (a few seconds for big pictures). */
export async function makePanorama(p: PanoramaPayload, report: Report): Promise<PanoramaResult> {
  let bitmaps: ImageBitmap[];
  try {
    bitmaps = await Promise.all((p.kind === 'whole' ? [p.file] : p.files).map((f) => createImageBitmap(f)));
  } catch {
    throw new Error(t('That picture can’t be opened. Use a PNG, JPG, WebP or GIF.'));
  }
  report(0.1);
  const pngs: (Uint8Array | null)[] = Array(6).fill(null);
  if (p.kind === 'whole') {
    const b = bitmaps[0];
    const k = Math.min(1, MAX_SOURCE / b.width);
    const src = bitmapPixels(b, Math.round(b.width * k), Math.round(b.height * k), true);
    const ratio = b.width / b.height;
    b.close();
    report(0.2);
    const faces: Img[] = equirectToFaces(src, p.size);
    faces.forEach((f, i) => {
      pngs[i] = encodePng(f);
      report(0.4 + (i + 1) * 0.1);
    });
    return { pngs, ratio };
  }
  bitmaps.forEach((b, i) => {
    const side = Math.min(b.width, b.height);
    pngs[p.slots[i]] = encodePng(bitmapPixels(b, p.size, p.size, true, { x: (b.width - side) / 2, y: (b.height - side) / 2, w: side, h: side }));
    b.close();
    report((i + 1) / bitmaps.length);
  });
  return { pngs, ratio: 1 };
}
