import { t } from '../../../lib/i18n-core';

/** Turning the SVG into pictures, and reading the result back the way a phone would (jsQR). */

/** The SVG drawn on a canvas `w` px wide; `white` puts it on white (JPEG has no see-through). */
export async function toCanvas(svg: string, w: number, h: number, white = false) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    if (white) {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(t('The picture couldn’t be made.')))), type, quality));

export type ScanResult = { ok: true; inverted: boolean } | { ok: false; wrong?: boolean };

const sameText = (got: { data: string; binaryData: number[] }, want: string) => {
  if (got.data === want) return true;
  const bytes = new TextEncoder().encode(want);
  return got.binaryData.length === bytes.length && got.binaryData.every((b, i) => b === bytes[i]);
};

/**
 * Whether the picture reads back as `want`, the way a phone camera sees it: on white (what's behind
 * a see-through code when printed), at a few sizes and a little out of focus. (jsQR misses many
 * perfectly sharp pictures, small dots most of all, that it reads once they're as soft as a camera
 * sees them.) Only when that fails, with light and dark swapped, which some scanners do and some don't.
 */
export async function checkScan(svg: string, w: number, h: number, want: string, units: number): Promise<ScanResult> {
  const { default: jsQR } = await import('jsqr');
  const big = await toCanvas(svg, w, h, true);
  // `units`: the picture's width in modules (squares of the code); sizes and blur go by the module.
  const view = (perModule: number, blur: number, invert: boolean) => {
    const width = Math.round(units * perModule);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.max(1, Math.round((width * h) / w));
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.filter = `blur(${blur * perModule}px)`;
    g.drawImage(big, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    // (jsQR's own "onlyInvert" doesn't find codes that it reads after swapping the pixels here.)
    if (invert) for (let i = 0; i < d.data.length; i += 4) (d.data[i] = 255 - d.data[i]), (d.data[i + 1] = 255 - d.data[i + 1]), (d.data[i + 2] = 255 - d.data[i + 2]);
    return d;
  };
  // jsQR sometimes throws on a picture it can't make sense of instead of finding nothing.
  const read = (d: ImageData) => {
    try {
      return jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
    } catch {
      return null;
    }
  };
  let wrong = false;
  for (const invert of [false, true])
    for (const perModule of [7, 5, 10])
      for (const blur of [0.25, 0.12, 0.4]) {
        const got = read(view(perModule, blur, invert));
        if (!got) continue;
        if (sameText(got, want)) return { ok: true, inverted: invert };
        wrong = true;
      }
  return wrong ? { ok: false, wrong: true } : { ok: false };
}

/** Relative brightness of a #rrggbb colour (WCAG). */
export function luminance(hex: string) {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((x) => {
    const v = parseInt(x, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
