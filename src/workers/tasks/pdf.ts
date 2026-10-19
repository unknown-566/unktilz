import { PDFDocument, degrees } from 'pdf-lib';
import { parseGroups, parsePages } from '../../lib/pageRange';
import type { Report, TaskOutput } from '../compute.worker';
import { decode, drawScaled } from './image';
import { scanPage, type ScanLook } from './scan';

export type MergePdfPayload = { files: File[] };

export async function mergePdf(p: MergePdfPayload, report: Report): Promise<TaskOutput> {
  const out = await PDFDocument.create();
  for (let i = 0; i < p.files.length; i++) {
    const f = p.files[i];
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      throw new Error(`${f.name} isn't a readable PDF.`);
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
    report((i + 1) / (p.files.length + 1));
  }
  const bytes = await out.save();
  const first = p.files[0]?.name.replace(/\.pdf$/i, '') || 'merged';
  return [{ name: p.files.length > 1 ? `${first}-merged.pdf` : `${first}.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }];
}

export type JpgsToPdfPayload = { pages: { jpg: Blob; width: number; height: number }[] };

/** Pages that are already JPGs (Compress PDF), each filling a page of its size. */
export async function jpgsToPdf(p: JpgsToPdfPayload, report: Report): Promise<Blob> {
  const out = await PDFDocument.create();
  for (let i = 0; i < p.pages.length; i++) {
    const { jpg, width, height } = p.pages[i];
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    out.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    report((i + 1) / p.pages.length);
  }
  return new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' });
}

export type ImagesToPdfPayload = {
  files: File[];
  page: 'fit' | 'a4' | 'letter';
  margin: number;
  /** 'scan' finds the sheet in a photo, straightens and cleans it. */
  mode: 'photo' | 'scan';
  look: ScanLook;
  crop: boolean;
};

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

/** EXIF orientation of a JPEG (1 = upright), read from the APP1 segment. */
function jpegOrientation(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 < b.length) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
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

export async function imagesToPdf(p: ImagesToPdfPayload, report: Report): Promise<TaskOutput> {
  const doc = await PDFDocument.create();
  const n = p.files.length;
  for (let i = 0; i < n; i++) {
    const f = p.files[i];
    const step = (x: number) => report((i + x) / (n + 0.2));
    const type = f.type || (/\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.png$/i.test(f.name) ? 'image/png' : '');
    let img;
    // Points per image pixel: photos are placed at 96 dpi, scans at 300 dpi (so a scan is page-sized).
    let ptPerPx = 0.75;
    if (p.mode === 'scan') {
      const bmp = await decode(f);
      const page = await scanPage(bmp, p.look, p.crop, (x) => step(x * 0.95));
      bmp.close();
      img = await doc.embedJpg(new Uint8Array(await page.blob.arrayBuffer()));
      ptPerPx = 72 / 300;
    } else {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (type === 'image/jpeg' && jpegOrientation(bytes) === 1) img = await doc.embedJpg(bytes);
      else if (type === 'image/png') img = await doc.embedPng(bytes);
      else {
        // Rotated phone JPEGs, webp, gif, bmp, avif…: draw through a canvas, which applies EXIF rotation.
        const bmp = await decode(f);
        const c = drawScaled(bmp, bmp.width, bmp.height, type === 'image/jpeg' ? '#ffffff' : undefined);
        bmp.close();
        const out = await c.convertToBlob(type === 'image/jpeg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
        const data = new Uint8Array(await out.arrayBuffer());
        img = type === 'image/jpeg' ? await doc.embedJpg(data) : await doc.embedPng(data);
      }
    }
    const iw = img.width * ptPerPx;
    const ih = img.height * ptPerPx;
    const m = p.margin;
    let pw: number;
    let ph: number;
    if (p.page === 'fit') {
      pw = iw + m * 2;
      ph = ih + m * 2;
    } else {
      const [a, b] = SIZES[p.page];
      [pw, ph] = iw > ih ? [b, a] : [a, b];
    }
    const k = Math.min((pw - m * 2) / iw, (ph - m * 2) / ih, p.page === 'fit' ? 1 : Infinity);
    const w = iw * k;
    const h = ih * k;
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    step(1);
  }
  const bytes = await doc.save();
  const first = p.files[0]?.name.replace(/\.[^.]+$/, '') || 'images';
  return [{ name: `${first}${n > 1 ? '-and-more' : ''}.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }];
}

export type OrganizePdfPayload = {
  file: File;
  /** keep: these pages, in this order. remove: all but these. each: every page alone. groups: "1-3; 4-6". */
  mode: 'keep' | 'remove' | 'each' | 'groups';
  pages: string;
  /** Clockwise, added to the chosen pages (all pages for "remove"). */
  rotate: 0 | 90 | 180 | 270;
};

export async function organizePdf(p: OrganizePdfPayload, report: Report): Promise<TaskOutput> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(await p.file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error(`${p.file.name} isn't a readable PDF.`);
  }
  const count = src.getPageCount();
  const base = p.file.name.replace(/\.pdf$/i, '') || 'document';
  const pad = (n: number) => String(n + 1).padStart(String(count).length, '0');

  let groups: { name: string; pages: number[] }[];
  if (p.mode === 'each') {
    groups = parsePages(p.pages, count).map((i) => ({ name: `${base}-page-${pad(i)}.pdf`, pages: [i] }));
  } else if (p.mode === 'groups') {
    groups = parseGroups(p.pages, count).map((g, i) => ({ name: `${base}-part-${i + 1}.pdf`, pages: g }));
  } else if (p.mode === 'remove') {
    if (!p.pages.trim()) throw new Error('Type which pages to remove, e.g. 2, 5-6.');
    const drop = new Set(parsePages(p.pages, count));
    const left = [...Array(count).keys()].filter((i) => !drop.has(i));
    if (!left.length) throw new Error('That would remove every page.');
    groups = [{ name: `${base}-edited.pdf`, pages: left }];
  } else {
    groups = [{ name: `${base}-edited.pdf`, pages: parsePages(p.pages, count) }];
  }

  const out: TaskOutput = [];
  for (let g = 0; g < groups.length; g++) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, groups[g].pages);
    for (const page of pages) {
      if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate) % 360));
      doc.addPage(page);
    }
    const bytes = await doc.save();
    out.push({ name: groups[g].name, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) });
    report((g + 1) / groups.length);
  }
  return out;
}

export type ScanPreviewPayload = { file: File; look: ScanLook; crop: boolean };

/** One photo cleaned up like a scanned page, exactly as Images to PDF puts it in. */
export async function scanPreview(p: ScanPreviewPayload): Promise<Blob> {
  const bmp = await decode(p.file);
  const page = await scanPage(bmp, p.look, p.crop, () => {});
  bmp.close();
  return page.blob;
}
