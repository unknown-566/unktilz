/**
 * Image formats the browser can't read or write by itself: HEIC (iPhone photos) and TIFF in,
 * ICO and BMP out. The decoders are loaded only when a file needs them.
 */

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

export const isHeic = (f: File) => /^(heic|heif)$/.test(ext(f.name)) || /image\/hei[cf]/.test(f.type);
export const isTiff = (f: File) => /^tiff?$/.test(ext(f.name)) || f.type === 'image/tiff';

type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (out: { data: Uint8ClampedArray } | null) => void): void;
  free?(): void;
};
type LibHeif = { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };

let heif: Promise<LibHeif> | null = null;

/** HEIC / HEIF through libheif (LGPL, compiled to wasm). Uses the first (main) picture. */
export async function decodeHeic(file: File): Promise<ImageBitmap> {
  heif ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(async (m) => (await m.default()) as LibHeif);
  const lib = await heif;
  const images = new lib.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  const img = images[0];
  if (!img) throw new Error(`${file.name} has no picture in it.`);
  const width = img.get_width();
  const height = img.get_height();
  const data = await new Promise<Uint8ClampedArray>((resolve, reject) =>
    img.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (out) => (out ? resolve(out.data) : reject(new Error(`Couldn't read ${file.name}.`)))),
  );
  for (const i of images) i.free?.();
  return createImageBitmap(new ImageData(new Uint8ClampedArray(data), width, height));
}

/** TIFF through UTIF (MIT). Uses the first page. */
export async function decodeTiff(file: File): Promise<ImageBitmap> {
  const { default: UTIF } = await import('utif2');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  // Thumbnails and masks come as tiny or 1-bit pages; the real picture is the biggest one.
  const page = ifds.reduce((a, b) => ((b.width ?? 0) * (b.height ?? 0) > (a.width ?? 0) * (a.height ?? 0) ? b : a), ifds[0]);
  if (!page) throw new Error(`${file.name} has no picture in it.`);
  UTIF.decodeImage(buf, page);
  const rgba = UTIF.toRGBA8(page);
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), page.width, page.height));
}

/** 24-bit BMP. Transparent parts become white, like JPG. */
export function encodeBmp(rgba: Uint8ClampedArray, w: number, h: number): Blob {
  const row = (w * 3 + 3) & ~3;
  const size = 54 + row * h;
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  b[0] = 0x42;
  b[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true); // positive: rows go bottom to top
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const a = rgba[s + 3] / 255;
      const d = dst + x * 3;
      b[d] = Math.round(rgba[s + 2] * a + 255 * (1 - a));
      b[d + 1] = Math.round(rgba[s + 1] * a + 255 * (1 - a));
      b[d + 2] = Math.round(rgba[s] * a + 255 * (1 - a));
    }
  }
  return new Blob([b], { type: 'image/bmp' });
}

/** An .ico holding one PNG per size (supported by Windows Vista+ and every browser). */
export function encodeIco(pngs: { size: number; data: Uint8Array }[]): Blob {
  const head = 6 + 16 * pngs.length;
  const total = head + pngs.reduce((n, p) => n + p.data.length, 0);
  const b = new Uint8Array(total);
  const v = new DataView(b.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, pngs.length, true);
  let offset = head;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    b[e] = p.size >= 256 ? 0 : p.size; // 0 means 256
    b[e + 1] = p.size >= 256 ? 0 : p.size;
    v.setUint16(e + 4, 1, true); // color planes
    v.setUint16(e + 6, 32, true); // bits per pixel
    v.setUint32(e + 8, p.data.length, true);
    v.setUint32(e + 12, offset, true);
    b.set(p.data, offset);
    offset += p.data.length;
  });
  return new Blob([b], { type: 'image/x-icon' });
}
