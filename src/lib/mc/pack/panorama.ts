import { blankImg, type Img } from './pixels';

/**
 * The title screen background: six square pictures (textures/gui/title/background/panorama_0…5)
 * on the inside of a cube around you: 0 front, 1 right, 2 back, 3 left, 4 up, 5 down. Up's bottom
 * edge and down's top edge touch the front picture. (Checked against the game's own panorama: these
 * edges line up.)
 */
export const PANORAMA_PATHS = [0, 1, 2, 3, 4, 5].map((i) => `textures/gui/title/background/panorama_${i}.png`);

/** Which way a point of a face looks: u to the right, v down, both 0…1; front is −z, up is +y. */
export function faceDir(face: number, u: number, v: number): [number, number, number] {
  const a = 2 * u - 1;
  const b = 1 - 2 * v;
  switch (face) {
    case 0:
      return [a, b, -1];
    case 1:
      return [1, b, a];
    case 2:
      return [-a, b, 1];
    case 3:
      return [-1, b, -a];
    case 4:
      // Its bottom edge (v = 1) runs along the front's top edge.
      return [a, 1, b];
    default:
      // Its top edge (v = 0) runs along the front's bottom edge.
      return [a, -1, -b];
  }
}

/**
 * Six faces from one 360° picture (equirectangular, twice as wide as tall, the middle looking
 * forward), sampled smoothly.
 */
export function equirectToFaces(src: Img, size: number): Img[] {
  const { w, h, data } = src;
  const sample = (x: number, y: number, out: Uint8ClampedArray, o: number) => {
    // Bilinear, wrapping round left to right.
    const x0 = Math.floor(x);
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0;
    const fy = Math.max(0, Math.min(1, y - y0));
    const xa = ((x0 % w) + w) % w;
    const xb = (xa + 1) % w;
    for (let c = 0; c < 4; c++) {
      const p = data[(y0 * w + xa) * 4 + c] * (1 - fx) + data[(y0 * w + xb) * 4 + c] * fx;
      const q = data[(y1 * w + xa) * 4 + c] * (1 - fx) + data[(y1 * w + xb) * 4 + c] * fx;
      out[o + c] = p * (1 - fy) + q * fy;
    }
  };
  return [0, 1, 2, 3, 4, 5].map((face) => {
    const img = blankImg(size, size);
    for (let py = 0; py < size; py++)
      for (let px = 0; px < size; px++) {
        const [x, y, z] = faceDir(face, (px + 0.5) / size, (py + 0.5) / size);
        const lon = Math.atan2(x, -z);
        const lat = Math.atan2(y, Math.hypot(x, z));
        sample((0.5 + lon / (2 * Math.PI)) * w - 0.5, (0.5 - lat / Math.PI) * h - 0.5, img.data, (py * size + px) * 4);
      }
    return img;
  });
}
