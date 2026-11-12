import type { Report, TaskOutput } from '../compute.worker';
import { decodeHeic, decodeTiff, encodeBmp, encodeIco, isHeic, isTiff } from './imageCodecs';
import { t } from '../../lib/i18n-core';

export type ImageFormat = 'keep' | 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp' | 'ico';

export type ImagePayload = {
  file: File;
  format: ImageFormat;
  /** 1..100 */
  quality: number;
  resize?: Resize;
  /** Clockwise. */
  rotate?: 0 | 90 | 180 | 270;
  flip?: 'none' | 'h' | 'v';
  /** Icon sizes for .ico, in pixels. */
  icoSizes?: number[];
  /**
   * Crop image: the part to keep, in pixels of the picture after `rotate` and `flip`. With a crop the
   * picture is turned first, then cut, then resized (`resize` applies to the cut part).
   */
  crop?: { x: number; y: number; w: number; h: number };
  /** Cut to a circle (an ellipse when the crop isn't square); outside is see-through, or white for JPG / BMP. */
  circle?: boolean;
};

/**
 * percent: scale by a factor. pixels: a width and/or height (0 = work it out from the other side).
 * fit: 'contain' fits inside the box, 'cover' fills it exactly and cuts off the middle's overflow,
 * 'stretch' forces the exact size. Without fit, keepAspect true = contain, false = stretch (Crop image).
 * noEnlarge: never bigger than the picture.
 */
export type Fit = 'contain' | 'cover' | 'stretch';
export type Resize =
  | { mode: 'percent'; percent: number; noEnlarge?: boolean }
  | { mode: 'pixels'; width: number; height: number; keepAspect?: boolean; fit?: Fit; noEnlarge?: boolean };

/** Biggest result: each side, and the whole area (bigger canvases fail or eat all memory). */
export const MAX_SIDE = 16384;
export const MAX_AREA = 100_000_000;

const MIME: Record<Exclude<ImageFormat, 'keep'>, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/x-icon': 'ico' };

/** Reads any image this site supports. Canvas decoding already turns phone photos upright (EXIF). */
export async function decode(file: Blob): Promise<ImageBitmap> {
  const name = (file as File).name ?? t('this image');
  if (file instanceof File && isHeic(file)) return decodeHeic(file);
  if (file instanceof File && isTiff(file)) return decodeTiff(file);
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(t('This browser can\'t read {name}.', { name }));
  }
}

/** "Same format": what to save a file as when the format isn't changed. */
function sameFormat(file: File): string {
  const tt = file.type.replace('jpg', 'jpeg');
  if (['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/bmp'].includes(tt)) return tt;
  if (/\.bmp$/i.test(file.name)) return 'image/bmp';
  // Photos (HEIC, TIFF) become JPG; GIF, ICO and SVG become PNG so transparency stays.
  return isHeic(file) || isTiff(file) ? 'image/jpeg' : 'image/png';
}

const fitOf = (r: Extract<Resize, { mode: 'pixels' }>): Fit => r.fit ?? (r.keepAspect === false ? 'stretch' : 'contain');

/**
 * The size of the result. `capped` is true when it had to be made smaller to stay under MAX_SIDE /
 * MAX_AREA, `kept` when "don't enlarge" kept it from growing.
 */
export function resultSize(w: number, h: number, resize: Resize | undefined) {
  let tw = w;
  let th = h;
  let kept = false;
  if (resize?.mode === 'percent') {
    const k = Math.max(1, resize.percent) / 100;
    tw = w * k;
    th = h * k;
    if (resize.noEnlarge && k > 1) {
      tw = w;
      th = h;
      kept = true;
    }
  } else if (resize) {
    const bw = resize.width > 0 ? resize.width : 0;
    const bh = resize.height > 0 ? resize.height : 0;
    const fit = fitOf(resize);
    if (bw || bh) {
      if (!bw || !bh || fit === 'contain') {
        const k = Math.min(bw ? bw / w : Infinity, bh ? bh / h : Infinity);
        tw = w * k;
        th = h * k;
      } else {
        tw = bw;
        th = bh;
      }
      if (resize.noEnlarge) {
        // Shrink the whole box evenly so nothing gets bigger than the picture (cover keeps its shape).
        const k = fit === 'stretch' ? 1 : Math.min(1, w / tw, h / th);
        const kw = fit === 'stretch' ? Math.min(1, w / tw) : k;
        const kh = fit === 'stretch' ? Math.min(1, h / th) : k;
        if (kw < 1 || kh < 1) kept = true;
        tw *= kw;
        th *= kh;
      }
    }
  }
  let capped = false;
  const k = Math.min(1, MAX_SIDE / tw, MAX_SIDE / th, Math.sqrt(MAX_AREA / (tw * th)));
  if (k < 1) {
    capped = true;
    tw *= k;
    th *= k;
  }
  return { w: Math.max(1, Math.round(tw)), h: Math.max(1, Math.round(th)), capped, kept };
}

export function targetSize(w: number, h: number, resize: Resize | undefined) {
  const r = resultSize(w, h, resize);
  return { w: r.w, h: r.h };
}

/** The middle part of a w × h picture that has the shape of tw × th (for "fill and crop"). */
export function coverCrop(w: number, h: number, tw: number, th: number) {
  const k = Math.min(w / tw, h / th);
  const cw = Math.max(1, Math.round(tw * k));
  const ch = Math.max(1, Math.round(th * k));
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch };
}

/** Draws with repeated halving so big downscales stay sharp instead of aliased. */
export function drawScaled(src: ImageBitmap | OffscreenCanvas, w: number, h: number, background?: string) {
  let source: CanvasImageSource = src;
  let sw = src.width;
  let sh = src.height;
  while (sw / 2 >= w && sh / 2 >= h) {
    const step = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const c = step.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(source, 0, 0, step.width, step.height);
    source = step;
    sw = step.width;
    sh = step.height;
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Turns (clockwise), then mirrors the turned picture, as it's seen. */
function transform(src: OffscreenCanvas, rotate: number, flip: ImagePayload['flip']) {
  if (!rotate && (!flip || flip === 'none')) return src;
  const side = rotate === 90 || rotate === 270;
  const out = new OffscreenCanvas(side ? src.height : src.width, side ? src.width : src.height);
  const ctx = out.getContext('2d')!;
  // Canvas transforms apply last-called first, so the mirror is set up before the turn.
  ctx.translate(out.width / 2, out.height / 2);
  ctx.scale(flip === 'h' ? -1 : 1, flip === 'v' ? -1 : 1);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Each size as a square PNG with the picture fitted in the middle. */
async function icoBlob(src: OffscreenCanvas, sizes: number[]) {
  const pngs = [];
  for (const size of [...new Set(sizes)].sort((a, b) => a - b)) {
    const k = Math.min(size / src.width, size / src.height);
    const w = Math.max(1, Math.round(src.width * k));
    const h = Math.max(1, Math.round(src.height * k));
    const fitted = drawScaled(src, w, h);
    const square = new OffscreenCanvas(size, size);
    square.getContext('2d')!.drawImage(fitted, Math.floor((size - w) / 2), Math.floor((size - h) / 2));
    const png = await square.convertToBlob({ type: 'image/png' });
    pngs.push({ size, data: new Uint8Array(await png.arrayBuffer()) });
  }
  return encodeIco(pngs);
}

/** The picture turned, cut to `crop` (kept inside the picture), resized and maybe cut round. */
function cropped(bmp: ImageBitmap, p: ImagePayload & { crop: NonNullable<ImagePayload['crop']> }, opaque: boolean) {
  const turned = transform(drawScaled(bmp, bmp.width, bmp.height), p.rotate ?? 0, p.flip);
  const x = Math.max(0, Math.min(turned.width - 1, Math.round(p.crop.x)));
  const y = Math.max(0, Math.min(turned.height - 1, Math.round(p.crop.y)));
  const cw = Math.max(1, Math.min(turned.width - x, Math.round(p.crop.w)));
  const ch = Math.max(1, Math.min(turned.height - y, Math.round(p.crop.h)));
  const piece = new OffscreenCanvas(cw, ch);
  piece.getContext('2d')!.drawImage(turned, x, y, cw, ch, 0, 0, cw, ch);
  const { w, h } = targetSize(cw, ch, p.resize);
  const out = drawScaled(piece, w, h);
  if (p.circle) {
    const ctx = out.getContext('2d')!;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!opaque) return out;
  // JPG and BMP have no see-through: white under it.
  const flat = new OffscreenCanvas(w, h);
  const fc = flat.getContext('2d')!;
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, w, h);
  fc.drawImage(out, 0, 0);
  return flat;
}

export async function processImage(p: ImagePayload, report: Report): Promise<TaskOutput> {
  report(0.1);
  const bmp = await decode(p.file);
  report(0.4);
  const mime = p.format === 'keep' ? sameFormat(p.file) : MIME[p.format];
  const opaque = mime === 'image/jpeg' || mime === 'image/bmp';
  let w: number, h: number, canvas: OffscreenCanvas;
  const cover = !p.crop && p.resize?.mode === 'pixels' && fitOf(p.resize) === 'cover' && p.resize.width > 0 && p.resize.height > 0;
  if (cover) {
    // Cut the middle to the box's shape, then scale it to the exact size.
    const { w: tw, h: th } = targetSize(bmp.width, bmp.height, p.resize);
    const crop = coverCrop(bmp.width, bmp.height, tw, th);
    canvas = cropped(bmp, { ...p, crop, resize: { mode: 'pixels', width: tw, height: th, fit: 'stretch' } }, opaque);
    ({ width: w, height: h } = canvas);
  } else if (p.crop) {
    canvas = cropped(bmp, { ...p, crop: p.crop }, opaque);
    ({ width: w, height: h } = canvas);
  } else {
    ({ w, h } = targetSize(bmp.width, bmp.height, p.resize));
    canvas = transform(drawScaled(bmp, w, h, opaque ? '#ffffff' : undefined), p.rotate ?? 0, p.flip);
  }
  bmp.close();
  report(0.7);
  let blob: Blob;
  if (mime === 'image/x-icon') blob = await icoBlob(canvas, p.icoSizes?.length ? p.icoSizes : [16, 32, 48]);
  else if (mime === 'image/bmp') blob = encodeBmp(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  else {
    blob = await canvas.convertToBlob({ type: mime, quality: Math.min(1, Math.max(0.01, p.quality / 100)) });
    if (blob.type !== mime) throw new Error(t('This browser can’t save {format} images. Pick another format.', { format: EXT[mime]?.toUpperCase() ?? mime }));
  }
  const base = p.file.name.replace(/\.[^.]+$/, '') || 'image';
  const suffix = p.crop ? '-cropped' : p.resize ? `-${w}x${h}` : '';
  const same = p.file.name.toLowerCase().endsWith(`.${EXT[mime]}`) && !suffix;
  report(1);
  return [{ name: `${base}${suffix}${same ? '-converted' : ''}.${EXT[mime]}`, blob }];
}

export type PreviewPayload = { file: File; max: number };
export type PreviewResult = { blob: Blob; width: number; height: number };

/** A small PNG of any image (for HEIC and TIFF, which the page itself can't show) and its real size. */
export async function previewImage(p: PreviewPayload): Promise<PreviewResult> {
  const bmp = await decode(p.file);
  const { width, height } = bmp;
  const k = Math.min(1, p.max / Math.max(width, height));
  const canvas = drawScaled(bmp, Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: 'image/png' }), width, height };
}
