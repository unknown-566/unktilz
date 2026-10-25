import { strFromU8, strToU8 } from 'fflate';
import { tx } from '../../i18n-core';
import { cloneImg, decodePng, encodePng, getPx, setPx, type Img } from './pixels';

/**
 * One-click changes, like Vanilla Tweaks. Each one takes the game's own file from the loaded version
 * and changes it, so it fits whatever version the pack is made with. Paths are below assets/minecraft/.
 */
export type Tweak = {
  id: string;
  label: string;
  help: string;
  /** Every file it may write (for opening a pack again). */
  paths: string[];
  /** The picture shown before / after. */
  show?: string;
  apply: (get: (path: string) => Uint8Array | undefined) => Record<string, Uint8Array>;
};

const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

/** Changes each listed picture that the version has. */
const eachPicture = (paths: string[], fn: (img: Img, path: string) => Img) => (get: (path: string) => Uint8Array | undefined) => {
  const out: Record<string, Uint8Array> = {};
  for (const p of paths) {
    const bytes = get(p);
    const img = bytes && decodePng(bytes);
    if (img) out[p] = encodePng(fn(img, p));
  }
  return out;
};

/** Each square frame of an animation strip (or the whole picture). */
function frames(img: Img, fn: (y0: number, fh: number) => void) {
  const fh = img.h > img.w && img.h % img.w === 0 ? img.w : img.h;
  for (let y0 = 0; y0 < img.h; y0 += fh) fn(y0, fh);
}

const FIRE = ['textures/block/fire_0.png', 'textures/block/fire_1.png', 'textures/block/soul_fire_0.png', 'textures/block/soul_fire_1.png'];
const GLASS = ['textures/block/glass.png', ...COLORS.map((c) => `textures/block/${c}_stained_glass.png`)];
const GLINT = ['textures/misc/enchanted_glint_item.png', 'textures/misc/enchanted_glint_armor.png', 'textures/misc/enchanted_glint_entity.png'];
const WATER = ['textures/block/water_still.png', 'textures/block/water_flow.png'];

export const TWEAKS: Tweak[] = [
  {
    id: 'low_fire',
    label: tx('Lower fire'),
    help: tx('The flames on your screen while you burn cover less of it: fire is drawn 40 % lower (fire blocks get shorter too).'),
    paths: FIRE,
    show: 'textures/block/fire_0.png',
    apply: eachPicture(FIRE, (src) => {
      const img = cloneImg(src);
      frames(img, (y0, fh) => {
        const by = Math.round(fh * 0.4);
        for (let y = y0 + fh - 1; y >= y0; y--)
          for (let x = 0; x < img.w; x++) setPx(img, x, y, y - by >= y0 ? getPx(src, x, y - by) : [0, 0, 0, 0]);
      });
      return img;
    }),
  },
  {
    id: 'clear_glass',
    label: tx('Clear glass'),
    help: tx('Glass and stained glass without the white streaks: only the frame stays.'),
    paths: GLASS,
    show: 'textures/block/glass.png',
    apply: eachPicture(GLASS, (src) => {
      const img = cloneImg(src);
      // Inside the 1 px frame, every pixel takes the color most of the inside has.
      const count = new Map<string, { n: number; c: [number, number, number, number] }>();
      for (let y = 1; y < img.h - 1; y++)
        for (let x = 1; x < img.w - 1; x++) {
          const c = getPx(src, x, y);
          const k = c.join();
          const e = count.get(k) ?? { n: 0, c };
          e.n++;
          count.set(k, e);
        }
      const fill = [...count.values()].sort((a, b) => b.n - a.n)[0]?.c ?? [0, 0, 0, 0];
      for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) setPx(img, x, y, fill);
      return img;
    }),
  },
  {
    id: 'clear_water',
    label: tx('Clearer water'),
    help: tx('You see further through water: the water texture and the blue tint under water are half as strong.'),
    paths: [...WATER, 'textures/misc/underwater.png'],
    show: 'textures/block/water_still.png',
    apply: eachPicture([...WATER, 'textures/misc/underwater.png'], (src, path) => {
      const img = cloneImg(src);
      const k = path.includes('underwater') ? 0.4 : 0.5;
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] * k);
      return img;
    }),
  },
  {
    id: 'transparent_pumpkin',
    label: tx('See-through pumpkin'),
    help: tx('Wearing a carved pumpkin barely darkens the screen any more.'),
    paths: ['textures/misc/pumpkinblur.png'],
    show: 'textures/misc/pumpkinblur.png',
    apply: eachPicture(['textures/misc/pumpkinblur.png'], (src) => {
      const img = cloneImg(src);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] * 0.25);
      return img;
    }),
  },
  {
    id: 'no_vignette',
    label: tx('No dark screen corners'),
    help: tx('Turns off the vignette, the darkening at the edges of the screen (with Fancy graphics).'),
    paths: ['textures/misc/vignette.png'],
    show: 'textures/misc/vignette.png',
    // The game darkens by how light this picture is, so all black darkens nothing.
    apply: eachPicture(['textures/misc/vignette.png'], (src) => {
      const img = cloneImg(src);
      for (let i = 0; i < img.data.length; i += 4) img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      return img;
    }),
  },
  {
    id: 'dim_glint',
    label: tx('Softer enchantment glint'),
    help: tx('The purple shimmer on enchanted items and armor is half as bright.'),
    paths: GLINT,
    show: 'textures/misc/enchanted_glint_item.png',
    apply: eachPicture(GLINT, (src) => {
      const img = cloneImg(src);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = img.data[i] >> 1;
        img.data[i + 1] = img.data[i + 1] >> 1;
        img.data[i + 2] = img.data[i + 2] >> 1;
      }
      return img;
    }),
  },
  {
    id: 'lower_shield',
    label: tx('Lower shield'),
    help: tx('The shield in your hand sits lower, so it hides less of the screen (it still covers you when blocking).'),
    paths: ['models/item/shield.json'],
    apply: (get): Record<string, Uint8Array> => {
      const bytes = get('models/item/shield.json');
      if (!bytes) return {};
      try {
        const m = JSON.parse(strFromU8(bytes)) as { display?: Record<string, { translation?: number[] }> };
        for (const hand of ['firstperson_righthand', 'firstperson_lefthand']) {
          const d = m.display?.[hand];
          if (d) d.translation = [d.translation?.[0] ?? 0, (d.translation?.[1] ?? 0) - 6, d.translation?.[2] ?? 0];
        }
        return { 'models/item/shield.json': strToU8(JSON.stringify(m, null, 2) + '\n') };
      } catch {
        return {};
      }
    },
  },
];

export const TWEAK_BY_ID = new Map(TWEAKS.map((t) => [t.id, t]));

/** The files the picked tweaks write (paths below assets/minecraft/). */
export function tweakFiles(ids: string[], get: (path: string) => Uint8Array | undefined): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const id of ids) Object.assign(out, TWEAK_BY_ID.get(id)?.apply(get) ?? {});
  return out;
}
