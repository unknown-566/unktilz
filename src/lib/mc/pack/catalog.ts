import { tx } from '../../i18n-core';
import type { Vanilla } from './vanilla';

/** The texture browser's tabs, by the folder under textures/. */
export const CATEGORIES = [
  { id: 'block', label: tx('Blocks'), folders: ['block'] },
  { id: 'item', label: tx('Items'), folders: ['item', 'trims'] },
  { id: 'entity', label: tx('Mobs & entities'), folders: ['entity'] },
  { id: 'gui', label: tx('GUI'), folders: ['gui', 'font', 'mob_effect', 'map'] },
  { id: 'particle', label: tx('Particles'), folders: ['particle', 'effect'] },
  { id: 'painting', label: tx('Paintings'), folders: ['painting'] },
  { id: 'other', label: tx('Other'), folders: [] },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

export type TextureInfo = {
  /** Below assets/minecraft/, e.g. "textures/block/oak_log_top.png". */
  path: string;
  cat: CategoryId;
  /** "Oak Log Top" */
  name: string;
  /** Where it is inside its category, e.g. "entity/chest" for "textures/entity/chest/normal.png". */
  folder: string;
  /** Has an animation in the game (frames under each other). */
  animated: boolean;
  /** Lower case words to search in. */
  search: string;
};

const categoryOf = (folder: string): CategoryId => CATEGORIES.find((c) => (c.folders as readonly string[]).includes(folder))?.id ?? 'other';

export const prettyName = (stem: string) =>
  stem
    .split(/[_/]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

const listCache = new WeakMap<object, TextureInfo[]>();

/** Every texture of a version, sorted by folder and name. */
export function textureList(v: Pick<Vanilla, 'files'>): TextureInfo[] {
  const hit = listCache.get(v.files);
  if (hit) return hit;
  const out: TextureInfo[] = [];
  for (const path of Object.keys(v.files)) {
    if (!path.startsWith('textures/') || !path.endsWith('.png')) continue;
    const rel = path.slice('textures/'.length, -'.png'.length);
    const parts = rel.split('/');
    const stem = parts[parts.length - 1];
    const folder = parts.slice(0, -1).join('/');
    let animated = false;
    const meta = v.files[`${path}.mcmeta`];
    if (meta) animated = new TextDecoder().decode(meta).includes('"animation"');
    out.push({ path, cat: categoryOf(parts[0]), name: prettyName(stem), folder, animated, search: `${rel.replace(/[_/]/g, ' ')} ${stem}`.toLowerCase() });
  }
  out.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  listCache.set(v.files, out);
  return out;
}

/**
 * Textures the game draws grey and colors by biome; shown in the plains colors so they don't look
 * grey here. (Only for showing: the pack keeps them grey, as the game expects.)
 */
const GRASS = '#91bd59';
const FOLIAGE = '#77ab2f';
const TINTS: Record<string, string> = {
  'textures/block/grass_block_top.png': GRASS,
  'textures/block/grass_block_side_overlay.png': GRASS,
  'textures/block/short_grass.png': GRASS,
  'textures/block/tall_grass_top.png': GRASS,
  'textures/block/tall_grass_bottom.png': GRASS,
  'textures/block/fern.png': GRASS,
  'textures/block/large_fern_top.png': GRASS,
  'textures/block/large_fern_bottom.png': GRASS,
  'textures/block/sugar_cane.png': GRASS,
  'textures/block/bush.png': GRASS,
  'textures/block/oak_leaves.png': FOLIAGE,
  'textures/block/jungle_leaves.png': FOLIAGE,
  'textures/block/acacia_leaves.png': FOLIAGE,
  'textures/block/dark_oak_leaves.png': FOLIAGE,
  'textures/block/mangrove_leaves.png': '#8db127',
  'textures/block/vine.png': FOLIAGE,
  'textures/block/birch_leaves.png': '#80a755',
  'textures/block/spruce_leaves.png': '#619961',
  'textures/block/lily_pad.png': '#208030',
  'textures/block/water_still.png': '#3f76e4',
  'textures/block/water_flow.png': '#3f76e4',
  'textures/block/water_overlay.png': '#3f76e4',
  'textures/block/redstone_dust_dot.png': '#e00000',
  'textures/block/redstone_dust_line0.png': '#e00000',
  'textures/block/redstone_dust_line1.png': '#e00000',
  'textures/block/attached_melon_stem.png': '#e0c71c',
  'textures/block/attached_pumpkin_stem.png': '#e0c71c',
  'textures/block/melon_stem.png': '#a0b02a',
  'textures/block/pumpkin_stem.png': '#a0b02a',
};
export const tintOf = (path: string): string | undefined => TINTS[path];
