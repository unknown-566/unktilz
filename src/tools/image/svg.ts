import { t } from '../../lib/i18n-core';

/** Size an SVG says it has: width/height, else its viewBox, else 512 px. */
export function svgSize(text: string): { w: number; h: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') throw new Error(t('This isn’t a valid SVG file.'));
  const px = (v: string | null) => {
    const m = v?.trim().match(/^([\d.]+)(px)?$/);
    return m ? Number(m[1]) : 0;
  };
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const vw = box.length === 4 ? box[2] : 0;
  const vh = box.length === 4 ? box[3] : 0;
  let w = px(svg.getAttribute('width'));
  let h = px(svg.getAttribute('height'));
  if (!w && !h) [w, h] = vw && vh ? [vw, vh] : [512, 512];
  else if (!w) w = vw && vh ? (h * vw) / vh : h;
  else if (!h) h = vw && vh ? (w * vh) / vw : w;
  return { w, h };
}

/**
 * Draws an SVG to a PNG at `scale` × its own size. This has to happen here, not in the worker:
 * workers can't decode SVG. The result keeps the original name so the output is named after it.
 */
export async function rasterizeSvg(file: File, scale: number): Promise<File> {
  const text = await file.text();
  const { w, h } = svgSize(text);
  const W = Math.max(1, Math.min(16384, Math.round(w * scale)));
  const H = Math.max(1, Math.min(16384, Math.round(h * scale)));
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image(W, H);
    img.src = url;
    await img.decode().catch(() => {
      throw new Error(t('Couldn\'t draw {name}. It may use fonts or images from elsewhere.', { name: file.name }));
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d')!.drawImage(img, 0, 0, W, H);
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!png) throw new Error(t('Couldn\'t draw {name}.', { name: file.name }));
    return new File([png], file.name, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
