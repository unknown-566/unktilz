import { useEffect, useMemo, useRef } from 'react';
import { computeValue } from '../../lib/compute';
import { t } from '../../lib/i18n-core';
import { isHeic, isTiff } from '../../workers/tasks/imageCodecs';
import { IMAGE_ACCEPTS } from './formats';

/** A picture opened in an image tool: its full size (upright) and a small copy to show. */
export type Picture = { file: File; W: number; H: number; bitmap: ImageBitmap };

/** Opens a picture; the copy shown is at most `max` pixels on its longer side. */
export async function loadPicture(file: File, max: number): Promise<Picture> {
  let W: number, H: number, bitmap: ImageBitmap;
  try {
    if (isHeic(file) || isTiff(file)) {
      // The page can't read these; the worker makes a small PNG and tells the real size.
      const p = await computeValue('image-preview', { file, max });
      W = p.width;
      H = p.height;
      bitmap = await createImageBitmap(p.blob);
    } else {
      const big = await createImageBitmap(file, { imageOrientation: 'from-image' });
      W = big.width;
      H = big.height;
      const k = Math.min(1, max / Math.max(W, H));
      bitmap = k < 1 ? await createImageBitmap(big, { resizeWidth: Math.round(W * k), resizeHeight: Math.round(H * k), resizeQuality: 'high' }) : big;
      if (bitmap !== big) big.close();
    }
  } catch {
    throw new Error(t('{name} couldn’t be read as a picture.', { name: file.name }));
  }
  return { file, W, H, bitmap };
}

export const isImage = (f: File) => f.type.startsWith('image/') || IMAGE_ACCEPTS.some((ext) => f.name.toLowerCase().endsWith(ext));

/** A small picture for the strip of opened files. */
export function Thumb({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useMemo(() => {
    const k = 72 / Math.max(bitmap.width, bitmap.height);
    return { w: Math.max(1, Math.round(bitmap.width * k)), h: Math.max(1, Math.round(bitmap.height * k)) };
  }, [bitmap]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.getContext('2d')!.drawImage(bitmap, 0, 0, size.w, size.h);
  }, [bitmap, size]);
  return <canvas ref={ref} width={size.w} height={size.h} />;
}
