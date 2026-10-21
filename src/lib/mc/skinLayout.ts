import { t } from '../i18n-core';

/**
 * Where every part of a 64×64 Java skin lives in the texture and on the 3D player.
 *
 * Texture: each body part is a box unfolded the vanilla way. For a box w×h×d whose texture starts at
 * (u, v): top (u+d, v) w×d · bottom (u+d+w, v) w×d · right (u, v+d) d×h · front (u+d, v+d) w×h ·
 * left (u+d+w, v+d) d×h · back (u+2d+w, v+d) w×h. "Right" is the player's own right side.
 *
 * 3D: 1 unit = 1 pixel, Y up, the player faces +Z and stands on y = 0, so their right side is −X.
 */

export const SKIN = 64;

export type Model = 'classic' | 'slim';
export type PartId = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export type Layer = 'base' | 'overlay';
export type FaceId = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export type Rect = { x: number; y: number; w: number; h: number };
export type Vec3 = [number, number, number];

export const PARTS: PartId[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const LAYERS: Layer[] = ['base', 'overlay'];
export const FACES: FaceId[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];

export const PART_LABEL: Record<PartId, [base: string, overlay: string]> = {
  head: [t('skin|Head'), t('skin|Hat')],
  body: [t('skin|Body'), t('skin|Jacket')],
  rightArm: [t('skin|Right arm'), t('skin|Right sleeve')],
  leftArm: [t('skin|Left arm'), t('skin|Left sleeve')],
  rightLeg: [t('skin|Right leg'), t('skin|Right pants leg')],
  leftLeg: [t('skin|Left leg'), t('skin|Left pants leg')],
};

const UV: Record<PartId, Record<Layer, [number, number]>> = {
  head: { base: [0, 0], overlay: [32, 0] },
  body: { base: [16, 16], overlay: [16, 32] },
  rightArm: { base: [40, 16], overlay: [40, 32] },
  leftArm: { base: [32, 48], overlay: [48, 48] },
  rightLeg: { base: [0, 16], overlay: [0, 32] },
  leftLeg: { base: [16, 48], overlay: [0, 48] },
};

/** Box size [w, h, d] in pixels. Slim ("Alex") arms are one pixel narrower. */
export function partSize(part: PartId, model: Model): Vec3 {
  if (part === 'head') return [8, 8, 8];
  if (part === 'body') return [8, 12, 4];
  if ((part === 'rightArm' || part === 'leftArm') && model === 'slim') return [3, 12, 4];
  return [4, 12, 4];
}

export function faceRect(part: PartId, layer: Layer, face: FaceId, model: Model): Rect {
  const [u, v] = UV[part][layer];
  const [w, h, d] = partSize(part, model);
  switch (face) {
    case 'top':
      return { x: u + d, y: v, w, h: d };
    case 'bottom':
      return { x: u + d + w, y: v, w, h: d };
    case 'right':
      return { x: u, y: v + d, w: d, h };
    case 'front':
      return { x: u + d, y: v + d, w, h };
    case 'left':
      return { x: u + d + w, y: v + d, w: d, h };
    case 'back':
      return { x: u + 2 * d + w, y: v + d, w, h };
  }
}

export type Region = { part: PartId; layer: Layer; face: FaceId; rect: Rect };

const regionCache = new Map<Model, { list: Region[]; map: Int16Array }>();

function regions(model: Model) {
  let r = regionCache.get(model);
  if (!r) {
    const list: Region[] = [];
    const map = new Int16Array(SKIN * SKIN).fill(-1);
    for (const part of PARTS)
      for (const layer of LAYERS)
        for (const face of FACES) {
          const rect = faceRect(part, layer, face, model);
          const i = list.push({ part, layer, face, rect }) - 1;
          for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) map[y * SKIN + x] = i;
        }
    r = { list, map };
    regionCache.set(model, r);
  }
  return r;
}

export const allRegions = (model: Model) => regions(model).list;

export type Texel = { region: Region; col: number; row: number };

/** What a texture pixel belongs to, or null for the unused parts of the texture. */
export function texelAt(model: Model, x: number, y: number): Texel | null {
  if (x < 0 || y < 0 || x >= SKIN || y >= SKIN) return null;
  const { list, map } = regions(model);
  const i = map[y * SKIN + x];
  if (i < 0) return null;
  const region = list[i];
  return { region, col: x - region.rect.x, row: y - region.rect.y };
}

export function findRegion(model: Model, part: PartId, layer: Layer, face: FaceId) {
  return regions(model).list.find((r) => r.part === part && r.layer === layer && r.face === face)!;
}

const MIRROR_PART: Record<PartId, PartId> = {
  head: 'head',
  body: 'body',
  rightArm: 'leftArm',
  leftArm: 'rightArm',
  rightLeg: 'leftLeg',
  leftLeg: 'rightLeg',
};
const MIRROR_FACE: Record<FaceId, FaceId> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };

/** The pixel on the other side of the player (left ↔ right), as seen in a mirror. */
export function mirrorTexel(model: Model, x: number, y: number): [number, number] | null {
  const t = texelAt(model, x, y);
  if (!t) return null;
  const r = findRegion(model, MIRROR_PART[t.region.part], t.region.layer, MIRROR_FACE[t.region.face]).rect;
  return [r.x + r.w - 1 - t.col, r.y + t.row];
}

/** Box corners in 3D. The outer layer is a slightly bigger box around the base one. */
export function box3d(part: PartId, layer: Layer, model: Model): { min: Vec3; max: Vec3 } {
  const [w] = partSize(part, model);
  let min: Vec3;
  let max: Vec3;
  switch (part) {
    case 'head':
      [min, max] = [[-4, 24, -4], [4, 32, 4]];
      break;
    case 'body':
      [min, max] = [[-4, 12, -2], [4, 24, 2]];
      break;
    case 'rightArm':
      [min, max] = [[-4 - w, 12, -2], [-4, 24, 2]];
      break;
    case 'leftArm':
      [min, max] = [[4, 12, -2], [4 + w, 24, 2]];
      break;
    case 'rightLeg':
      [min, max] = [[-4, 0, -2], [0, 12, 2]];
      break;
    case 'leftLeg':
      [min, max] = [[0, 0, -2], [4, 12, 2]];
      break;
  }
  if (layer === 'overlay') {
    const k = part === 'head' ? 0.5 : 0.25;
    min = [min[0] - k, min[1] - k, min[2] - k];
    max = [max[0] + k, max[1] + k, max[2] + k];
  }
  return { min, max };
}

/**
 * A face in 3D: `origin` is where the texture rectangle's top-left pixel corner sits, `u` runs along
 * the texture's columns and `v` down its rows. Seen from outside, u points right and v points down,
 * so the outward normal is v × u.
 */
export function faceFrame(part: PartId, layer: Layer, face: FaceId, model: Model): { origin: Vec3; u: Vec3; v: Vec3 } {
  const {
    min: [x0, y0, z0],
    max: [x1, y1, z1],
  } = box3d(part, layer, model);
  const W = x1 - x0;
  const H = y1 - y0;
  const D = z1 - z0;
  switch (face) {
    case 'front':
      return { origin: [x0, y1, z1], u: [W, 0, 0], v: [0, -H, 0] };
    case 'back':
      return { origin: [x1, y1, z0], u: [-W, 0, 0], v: [0, -H, 0] };
    case 'right':
      return { origin: [x0, y1, z0], u: [0, 0, D], v: [0, -H, 0] };
    case 'left':
      return { origin: [x1, y1, z1], u: [0, 0, -D], v: [0, -H, 0] };
    case 'top':
      return { origin: [x0, y1, z0], u: [W, 0, 0], v: [0, 0, D] };
    case 'bottom':
      return { origin: [x0, y0, z1], u: [W, 0, 0], v: [0, 0, -D] };
  }
}

const px = (_d: Uint8ClampedArray, x: number, y: number) => (y * SKIN + x) * 4;

/**
 * Old 64×32 skins have no left arm or leg of their own: the game mirrors the right ones, and the
 * lower half (outer layers of body and limbs) is empty. Returns a 64×64 copy laid out the new way.
 */
export function upgradeLegacy(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SKIN * SKIN * 4);
  out.set(src.subarray(0, SKIN * 32 * 4));
  for (const part of ['leftArm', 'leftLeg'] as const)
    for (const face of FACES) {
      const r = faceRect(part, 'base', face, 'classic');
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const [mx, my] = mirrorTexel('classic', x, y)!;
          const s = px(out, mx, my);
          out.copyWithin(px(out, x, y), s, s + 4);
        }
    }
  // The game draws the base layer fully opaque, and old skins often left the hat area solid.
  // Same "Notch transparency" rule as the game: a hat with no see-through pixel at all is dropped.
  const opaqueBase = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[px(out, x, y) + 3] = 255;
  };
  opaqueBase(0, 0, 32, 16);
  opaqueBase(0, 16, 64, 32);
  opaqueBase(16, 48, 48, 64);
  let hatSeeThrough = false;
  for (let y = 0; y < 16 && !hatSeeThrough; y++) for (let x = 32; x < 64; x++) if (out[px(out, x, y) + 3] < 128) hatSeeThrough = true;
  if (!hatSeeThrough) for (let y = 0; y < 16; y++) for (let x = 32; x < 64; x++) out[px(out, x, y) + 3] = 0;
  return out;
}

/** Slim skins leave the two right-most columns of the right arm unused (and see-through). */
export function guessModel(d: Uint8ClampedArray): Model {
  for (let y = 20; y < 32; y++) for (const x of [54, 55]) if (d[px(d, x, y) + 3] !== 0) return 'classic';
  return 'slim';
}

/**
 * Copies one part's layer from `src` into `dst`, face by face. Between a classic and a slim arm the
 * columns are resampled: going narrower drops an inner column, going wider doubles one, so both
 * edges stay and nothing is left blank.
 */
export function copyPart(src: Uint8ClampedArray, srcModel: Model, dst: Uint8ClampedArray, dstModel: Model, part: PartId, layer: Layer) {
  for (const face of FACES) {
    const s = faceRect(part, layer, face, srcModel);
    const d = faceRect(part, layer, face, dstModel);
    for (let row = 0; row < d.h; row++)
      for (let col = 0; col < d.w; col++) {
        const sc = d.w === s.w ? col : d.w === 1 ? 0 : Math.round((col * (s.w - 1)) / (d.w - 1));
        const sr = d.h === s.h ? row : Math.round((row * (s.h - 1)) / Math.max(1, d.h - 1));
        const si = px(src, s.x + sc, s.y + sr);
        const di = px(dst, d.x + col, d.y + row);
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
  }
}

/** Re-lays the arm textures for the other model so they look the same, and clears what's left over. */
export function convertArms(d: Uint8ClampedArray, from: Model, to: Model): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d);
  if (from === to) return out;
  for (const part of ['rightArm', 'leftArm'] as const)
    for (const layer of LAYERS)
      for (const face of FACES) {
        const r = faceRect(part, layer, face, from);
        for (let y = r.y; y < r.y + r.h; y++) out.fill(0, px(out, r.x, y), px(out, r.x + r.w, y));
      }
  for (const part of ['rightArm', 'leftArm'] as const) for (const layer of LAYERS) copyPart(d, from, out, to, part, layer);
  return out;
}
