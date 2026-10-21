import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFObject } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import type { Report, TaskOutput } from '../compute.worker';
import { t } from '../../lib/i18n-core';

/**
 * Compress PDF "keep text": only the pictures inside the PDF are made smaller (fewer pixels, JPEG),
 * so text and drawings stay sharp and selectable. Pictures this can't safely redo (CMYK, palettes,
 * masks, odd bit depths, inverted ones) are left alone.
 */

export type CompressLevel = 'strong' | 'balanced' | 'light';
export const IMAGE_LEVELS: Record<CompressLevel, { side: number; quality: number }> = {
  strong: { side: 1200, quality: 0.6 },
  balanced: { side: 1700, quality: 0.72 },
  light: { side: 2400, quality: 0.85 },
};

export type CompressImagesPayload = { file: File; level: CompressLevel; gray: boolean };

/** Flate pictures smaller than this (icons, logos) stay as they are: JPEG would only blur them. */
const MIN_FLATE_PIXELS = 200 * 200;

const name = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

/** Undoes the PNG predictors (Predictor ≥ 10) of a Flate stream with `bpp` bytes per pixel. */
export function unpredict(data: Uint8Array, columns: number, bpp: number) {
  const row = columns * bpp;
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  for (let y = 0; y < rows; y++) {
    const type = data[y * (row + 1)];
    const src = y * (row + 1) + 1;
    const dst = y * row;
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y ? out[dst - row + x] : 0;
      const c = x >= bpp && y ? out[dst - row + x - bpp] : 0;
      const v = data[src + x];
      let pred = 0;
      if (type === 1) pred = a;
      else if (type === 2) pred = b;
      else if (type === 3) pred = (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = (v + pred) & 255;
    }
  }
  return out;
}

/** 1 for gray, 3 for RGB, or null for colour spaces this doesn't redo. */
function channels(cs: PDFObject | undefined, doc: PDFDocument): 1 | 3 | null {
  const v = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  const n = name(v);
  if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
  if (n === 'DeviceGray' || n === 'CalGray') return 1;
  if (v instanceof PDFArray && name(v.get(0)) === 'ICCBased') {
    const icc = doc.context.lookup(v.get(1));
    const count = icc instanceof PDFRawStream ? num(icc.dict.get(PDFName.of('N'))) : undefined;
    return count === 3 ? 3 : count === 1 ? 1 : null;
  }
  if (v instanceof PDFArray && (name(v.get(0)) === 'CalRGB' || name(v.get(0)) === 'CalGray')) return name(v.get(0)) === 'CalRGB' ? 3 : 1;
  return null;
}

/** The picture of one image stream, or null when it's one to leave alone. */
async function decodeImage(stream: PDFRawStream, doc: PDFDocument): Promise<ImageBitmap | OffscreenCanvas | null> {
  const d = stream.dict;
  if (d.get(PDFName.of('ImageMask')) === PDFBool.True || d.get(PDFName.of('Decode')) || d.get(PDFName.of('Mask'))) return null;
  const f = d.get(PDFName.of('Filter'));
  const filters = f instanceof PDFArray ? f.asArray().map((x) => name(x)) : [name(f)];
  if (filters.length !== 1) return null;
  const n = channels(d.get(PDFName.of('ColorSpace')), doc);
  if (!n) return null;
  if (filters[0] === 'DCTDecode') {
    try {
      return await createImageBitmap(new Blob([stream.contents as BlobPart], { type: 'image/jpeg' }));
    } catch {
      return null;
    }
  }
  if (filters[0] !== 'FlateDecode' || num(d.get(PDFName.of('BitsPerComponent'))) !== 8) return null;
  const w = num(d.get(PDFName.of('Width'))) ?? 0;
  const h = num(d.get(PDFName.of('Height'))) ?? 0;
  if (w * h < MIN_FLATE_PIXELS) return null;
  let raw: Uint8Array;
  try {
    raw = unzlibSync(stream.contents);
  } catch {
    return null;
  }
  const parms = d.lookup(PDFName.of('DecodeParms'));
  const predictor = parms instanceof PDFDict ? (num(parms.get(PDFName.of('Predictor'))) ?? 1) : 1;
  if (predictor >= 10) raw = unpredict(raw, num((parms as PDFDict).get(PDFName.of('Columns'))) ?? w, n);
  else if (predictor !== 1) return null;
  if (raw.length < w * h * n) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += n) {
    const o = i * 4;
    rgba[o] = raw[j];
    rgba[o + 1] = raw[j + (n === 3 ? 1 : 0)];
    rgba[o + 2] = raw[j + (n === 3 ? 2 : 0)];
    rgba[o + 3] = 255;
  }
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return c;
}

export async function compressPdfImages(p: CompressImagesPayload, report: Report): Promise<TaskOutput> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(await p.file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error(t('{name} isn\'t a readable PDF.', { name: p.file.name }));
  }
  const level = IMAGE_LEVELS[p.level] ?? IMAGE_LEVELS.balanced;
  const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && name(o.dict.get(PDFName.of('Subtype'))) === 'Image') as [PDFRef, PDFRawStream][];
  let changed = 0;
  for (let i = 0; i < images.length; i++) {
    const [ref, stream] = images[i];
    report((i / Math.max(1, images.length)) * 0.9);
    const pic = await decodeImage(stream, doc);
    if (!pic) continue;
    const k = Math.min(1, level.side / Math.max(pic.width, pic.height));
    const w = Math.max(1, Math.round(pic.width * k));
    const h = Math.max(1, Math.round(pic.height * k));
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    if (p.gray) g.filter = 'grayscale(1)';
    g.drawImage(pic, 0, 0, w, h);
    if ('close' in pic) pic.close();
    const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: level.quality })).arrayBuffer());
    // Only when it really gets smaller.
    if (jpg.length >= stream.contents.length * 0.95) continue;
    const dict = stream.dict.clone(doc.context);
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    dict.set(PDFName.of('Width'), PDFNumber.of(w));
    dict.set(PDFName.of('Height'), PDFNumber.of(h));
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
    dict.delete(PDFName.of('DecodeParms'));
    doc.context.assign(ref, PDFRawStream.of(dict, jpg));
    changed++;
  }
  const bytes = await doc.save({ useObjectStreams: true });
  report(1);
  if (bytes.length > p.file.size * 0.95) {
    const kb = (n: number) => (n < 1e6 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const sizes = `${kb(p.file.size)} → ${kb(Math.min(bytes.length, p.file.size))}`;
    // A PDF of only text is already about as small as it gets: redrawing would make it bigger.
    if (!images.length) throw new Error(t('This PDF has no pictures to shrink ({sizes}): it’s text and drawings, which are already small.', { sizes }));
    throw new Error(
      changed
        ? t('Keeping the text saves almost nothing on this PDF ({sizes}): its pictures are already well compressed. “Redraw pages” can make it smaller, but then the text can’t be selected.', { sizes })
        : t('Keeping the text saves almost nothing on this PDF ({sizes}): its pictures are already small. “Redraw pages” can make it smaller, but then the text can’t be selected.', { sizes }),
    );
  }
  return [{ name: `${p.file.name.replace(/\.pdf$/i, '') || 'document'}-compressed.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }];
}
