import type { Report, TaskOutput } from '../compute.worker';

export type ImageFormat = 'keep' | 'png' | 'jpeg' | 'webp' | 'avif';

export type ImagePayload = {
  file: File;
  format: ImageFormat;
  /** 1..100 */
  quality: number;
  resize?: { mode: 'percent'; percent: number } | { mode: 'pixels'; width: number; height: number; keepAspect: boolean };
};

const MIME: Record<Exclude<ImageFormat, 'keep'>, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
};
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' };

export async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`This browser can't read ${(file as File).name ?? 'this image'}.`);
  }
}

export function targetSize(w: number, h: number, resize: ImagePayload['resize']) {
  if (!resize) return { w, h };
  if (resize.mode === 'percent') {
    const k = Math.max(1, resize.percent) / 100;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  let tw = resize.width > 0 ? resize.width : 0;
  let th = resize.height > 0 ? resize.height : 0;
  if (!tw && !th) return { w, h };
  if (resize.keepAspect || !tw || !th) {
    // With both set and aspect locked, fit inside the box.
    const k = Math.min(tw ? tw / w : Infinity, th ? th / h : Infinity);
    tw = Math.round(w * k);
    th = Math.round(h * k);
  }
  return { w: Math.max(1, Math.min(16384, tw)), h: Math.max(1, Math.min(16384, th)) };
}

/** Draws with repeated halving so big downscales stay sharp instead of aliased. */
export function drawScaled(src: ImageBitmap, w: number, h: number, background?: string) {
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

export async function processImage(p: ImagePayload, report: Report): Promise<TaskOutput> {
  report(0.1);
  const bmp = await decode(p.file);
  report(0.4);
  const original = MIME[p.file.type.replace('image/', '').replace('jpg', 'jpeg') as keyof typeof MIME];
  const mime = p.format === 'keep' ? original ?? 'image/png' : MIME[p.format];
  const { w, h } = targetSize(bmp.width, bmp.height, p.resize);
  const canvas = drawScaled(bmp, w, h, mime === 'image/jpeg' ? '#ffffff' : undefined);
  bmp.close();
  report(0.7);
  const blob = await canvas.convertToBlob({ type: mime, quality: Math.min(1, Math.max(0.01, p.quality / 100)) });
  if (blob.type !== mime) throw new Error(`This browser can't save ${EXT[mime]?.toUpperCase() ?? mime} images. Pick another format.`);
  const base = p.file.name.replace(/\.[^.]+$/, '') || 'image';
  const suffix = p.resize ? `-${w}x${h}` : '';
  report(1);
  return [{ name: `${base}${suffix}.${EXT[mime]}`, blob }];
}
