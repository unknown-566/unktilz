import { PDFDocument } from 'pdf-lib';
import type { Report, TaskOutput } from '../compute.worker';
import { decode, drawScaled } from './image';
import { detectSheet, scanPage, turn, type ScanLook } from './scan';
import { place, type Layout, type PageSize } from '../../tools/pdf/scan/layout';
import { drawWords, type OcrWord } from './ocrLayer';

/**
 * Images to PDF: photos (of paper or not) made into PDF pages. The page shows a photo's corners
 * (scan-detect), each page is made on its own (prepare-page, so the page can recognise its text in
 * between) and then they're put together (pages-to-pdf).
 */

type Pt = [number, number];

export type ScanDetectPayload = { file: File; turn: number };
/** The sheet's corners as fractions of the (turned) photo, or null; and a smaller copy to show. */
export type ScanDetectResult = { quad: Pt[] | null; w: number; h: number; preview: Blob };

/** Pictures shown to drag the corners on are at most this big. */
const PREVIEW_SIDE = 1600;

export async function scanDetect(p: ScanDetectPayload): Promise<ScanDetectResult> {
  const bmp = await decode(p.file);
  const src = turn(bmp, p.turn);
  const quad = detectSheet(src);
  const k = Math.min(1, PREVIEW_SIDE / Math.max(src.width, src.height));
  const small = drawScaled(src, Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)), '#ffffff');
  const preview = await small.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const out = { quad, w: src.width, h: src.height, preview };
  bmp.close();
  return out;
}

export type PreparePagePayload = {
  file: File;
  /** Clockwise turn added on top of the photo's own (EXIF) one. */
  turn: number;
  /** 'scan' straightens and cleans a photo of paper; 'photo' puts the photo in as it is. */
  mode: 'scan' | 'photo';
  look: ScanLook;
  /** The sheet's corners (fractions of the turned photo); null = the whole photo. */
  quad: Pt[] | null;
  layout: Layout;
};
/** A finished page picture: what goes on the PDF page, and where it was on its sheet ("content"). */
export type PreparedPage = { blob: Blob; type: 'jpg' | 'png'; width: number; height: number; dpi: number; sheet?: { w: number; h: number; x: number; y: number } };

/** EXIF orientation of a JPEG (1 = upright), read from the APP1 segment. */
function jpegOrientation(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 < b.length) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 < b.length && v.getUint32(off + 4) === 0x45786966) {
      const t = off + 10;
      const le = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, le);
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le);
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return 1;
}

/** Photos without a scan are placed at this many pixels per inch (so "fit image" pages aren't huge). */
const PHOTO_DPI = 96;

export async function preparePage(p: PreparePagePayload, report: Report): Promise<PreparedPage> {
  if (p.mode === 'scan') {
    const bmp = await decode(p.file);
    const page = await scanPage(turn(bmp, p.turn), p.look, p.quad, p.layout === 'content', report);
    bmp.close();
    return { blob: page.blob, type: 'jpg', width: page.width, height: page.height, dpi: 300, sheet: page.sheet };
  }
  const type = p.file.type || (/\.jpe?g$/i.test(p.file.name) ? 'image/jpeg' : /\.png$/i.test(p.file.name) ? 'image/png' : '');
  const bytes = new Uint8Array(await p.file.arrayBuffer());
  // JPEGs and PNGs that need no turning go in as they are (no quality lost).
  if (!p.turn && ((type === 'image/jpeg' && jpegOrientation(bytes) === 1) || type === 'image/png')) {
    const bmp = await decode(p.file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return { blob: p.file, type: type === 'image/png' ? 'png' : 'jpg', ...size, dpi: PHOTO_DPI };
  }
  // Rotated phone JPEGs, webp, gif, heic…: drawn upright (and turned) through a canvas.
  const bmp = await decode(p.file);
  const src = turn(bmp, p.turn);
  const c = drawScaled(src, src.width, src.height, type === 'image/jpeg' || type === '' ? '#ffffff' : undefined);
  bmp.close();
  const jpg = type !== 'image/png' && type !== 'image/gif' && type !== 'image/webp';
  const blob = await c.convertToBlob(jpg ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
  report(1);
  return { blob, type: jpg ? 'jpg' : 'png', width: c.width, height: c.height, dpi: PHOTO_DPI };
}

export type PagesToPdfPayload = {
  name: string;
  pages: (PreparedPage & { words?: OcrWord[] })[];
  size: PageSize;
  /** In points. */
  margin: number;
  layout: Layout;
};

export async function pagesToPdf(p: PagesToPdfPayload, report: Report): Promise<TaskOutput> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < p.pages.length; i++) {
    const pg = p.pages[i];
    const data = new Uint8Array(await pg.blob.arrayBuffer());
    const img = pg.type === 'png' ? await doc.embedPng(data) : await doc.embedJpg(data);
    const at = place({ w: pg.width, h: pg.height, sheet: pg.sheet }, p.size, p.margin, p.layout, pg.dpi);
    const page = doc.addPage([at.pageW, at.pageH]);
    page.drawImage(img, { x: at.x, y: at.y, width: at.w, height: at.h });
    if (pg.words?.length) await drawWords(doc, page, pg.words, at, pg.width);
    report((i + 1) / p.pages.length);
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return [{ name: p.name, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }];
}
