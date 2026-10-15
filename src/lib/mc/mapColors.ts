// Java Edition map base colors (1.17+), index = map color id, with one cheap block that shows it.
// Water (12) is left out: its shade depends on depth, not on staircasing.
// `expensive` marks blocks a survival player would rather not spend.

export type MapBase = {
  id: number;
  rgb: number;
  block: string;
  /** Namespaced block id for schematics. */
  blockId: string;
  /** Block state properties that differ from the default (e.g. leaves must not decay). */
  props?: Record<string, string>;
  expensive?: boolean;
};

export const MAP_BASE: MapBase[] = [
  { id: 1, rgb: 0x7fb238, block: 'Grass Block', blockId: 'minecraft:grass_block' },
  { id: 2, rgb: 0xf7e9a3, block: 'Sandstone', blockId: 'minecraft:sandstone' },
  { id: 3, rgb: 0xc7c7c7, block: 'Mushroom Stem', blockId: 'minecraft:mushroom_stem' },
  { id: 4, rgb: 0xff0000, block: 'Block of Redstone', blockId: 'minecraft:redstone_block' },
  { id: 5, rgb: 0xa0a0ff, block: 'Packed Ice', blockId: 'minecraft:packed_ice' },
  { id: 6, rgb: 0xa7a7a7, block: 'Block of Iron', blockId: 'minecraft:iron_block', expensive: true },
  { id: 7, rgb: 0x007c00, block: 'Oak Leaves', blockId: 'minecraft:oak_leaves', props: { persistent: 'true' } },
  { id: 8, rgb: 0xffffff, block: 'White Concrete', blockId: 'minecraft:white_concrete' },
  { id: 9, rgb: 0xa4a8b8, block: 'Clay', blockId: 'minecraft:clay' },
  { id: 10, rgb: 0x976d4d, block: 'Dirt', blockId: 'minecraft:dirt' },
  { id: 11, rgb: 0x707070, block: 'Stone', blockId: 'minecraft:stone' },
  { id: 13, rgb: 0x8f7748, block: 'Oak Planks', blockId: 'minecraft:oak_planks' },
  { id: 14, rgb: 0xfffcf5, block: 'Block of Quartz', blockId: 'minecraft:quartz_block' },
  { id: 15, rgb: 0xd87f33, block: 'Orange Concrete', blockId: 'minecraft:orange_concrete' },
  { id: 16, rgb: 0xb24cd8, block: 'Magenta Concrete', blockId: 'minecraft:magenta_concrete' },
  { id: 17, rgb: 0x6699d8, block: 'Light Blue Concrete', blockId: 'minecraft:light_blue_concrete' },
  { id: 18, rgb: 0xe5e533, block: 'Yellow Concrete', blockId: 'minecraft:yellow_concrete' },
  { id: 19, rgb: 0x7fcc19, block: 'Lime Concrete', blockId: 'minecraft:lime_concrete' },
  { id: 20, rgb: 0xf27fa5, block: 'Pink Concrete', blockId: 'minecraft:pink_concrete' },
  { id: 21, rgb: 0x4c4c4c, block: 'Gray Concrete', blockId: 'minecraft:gray_concrete' },
  { id: 22, rgb: 0x999999, block: 'Light Gray Concrete', blockId: 'minecraft:light_gray_concrete' },
  { id: 23, rgb: 0x4c7f99, block: 'Cyan Concrete', blockId: 'minecraft:cyan_concrete' },
  { id: 24, rgb: 0x7f3fb2, block: 'Purple Concrete', blockId: 'minecraft:purple_concrete' },
  { id: 25, rgb: 0x334cb2, block: 'Blue Concrete', blockId: 'minecraft:blue_concrete' },
  { id: 26, rgb: 0x664c33, block: 'Brown Concrete', blockId: 'minecraft:brown_concrete' },
  { id: 27, rgb: 0x667f33, block: 'Green Concrete', blockId: 'minecraft:green_concrete' },
  { id: 28, rgb: 0x993333, block: 'Red Concrete', blockId: 'minecraft:red_concrete' },
  { id: 29, rgb: 0x191919, block: 'Black Concrete', blockId: 'minecraft:black_concrete' },
  { id: 30, rgb: 0xfaee4d, block: 'Block of Gold', blockId: 'minecraft:gold_block', expensive: true },
  { id: 31, rgb: 0x5cdbd5, block: 'Block of Diamond', blockId: 'minecraft:diamond_block', expensive: true },
  { id: 32, rgb: 0x4a80ff, block: 'Block of Lapis Lazuli', blockId: 'minecraft:lapis_block', expensive: true },
  { id: 33, rgb: 0x00d93a, block: 'Block of Emerald', blockId: 'minecraft:emerald_block', expensive: true },
  { id: 34, rgb: 0x815631, block: 'Spruce Planks', blockId: 'minecraft:spruce_planks' },
  { id: 35, rgb: 0x700200, block: 'Netherrack', blockId: 'minecraft:netherrack' },
  { id: 36, rgb: 0xd1b1a1, block: 'White Terracotta', blockId: 'minecraft:white_terracotta' },
  { id: 37, rgb: 0x9f5224, block: 'Orange Terracotta', blockId: 'minecraft:orange_terracotta' },
  { id: 38, rgb: 0x95576c, block: 'Magenta Terracotta', blockId: 'minecraft:magenta_terracotta' },
  { id: 39, rgb: 0x706c8a, block: 'Light Blue Terracotta', blockId: 'minecraft:light_blue_terracotta' },
  { id: 40, rgb: 0xba8524, block: 'Yellow Terracotta', blockId: 'minecraft:yellow_terracotta' },
  { id: 41, rgb: 0x677535, block: 'Lime Terracotta', blockId: 'minecraft:lime_terracotta' },
  { id: 42, rgb: 0xa04d4e, block: 'Pink Terracotta', blockId: 'minecraft:pink_terracotta' },
  { id: 43, rgb: 0x392923, block: 'Gray Terracotta', blockId: 'minecraft:gray_terracotta' },
  { id: 44, rgb: 0x876b62, block: 'Light Gray Terracotta', blockId: 'minecraft:light_gray_terracotta' },
  { id: 45, rgb: 0x575c5c, block: 'Cyan Terracotta', blockId: 'minecraft:cyan_terracotta' },
  { id: 46, rgb: 0x7a4958, block: 'Purple Terracotta', blockId: 'minecraft:purple_terracotta' },
  { id: 47, rgb: 0x4c3e5c, block: 'Blue Terracotta', blockId: 'minecraft:blue_terracotta' },
  { id: 48, rgb: 0x4c3223, block: 'Brown Terracotta', blockId: 'minecraft:brown_terracotta' },
  { id: 49, rgb: 0x4c522a, block: 'Green Terracotta', blockId: 'minecraft:green_terracotta' },
  { id: 50, rgb: 0x8e3c2e, block: 'Red Terracotta', blockId: 'minecraft:red_terracotta' },
  { id: 51, rgb: 0x251610, block: 'Black Terracotta', blockId: 'minecraft:black_terracotta' },
  { id: 52, rgb: 0xbd3031, block: 'Crimson Nylium', blockId: 'minecraft:crimson_nylium' },
  { id: 53, rgb: 0x943f61, block: 'Crimson Planks', blockId: 'minecraft:crimson_planks' },
  { id: 54, rgb: 0x5c191d, block: 'Crimson Hyphae', blockId: 'minecraft:crimson_hyphae' },
  { id: 55, rgb: 0x167e86, block: 'Warped Nylium', blockId: 'minecraft:warped_nylium' },
  { id: 56, rgb: 0x3a8e8c, block: 'Warped Planks', blockId: 'minecraft:warped_planks' },
  { id: 57, rgb: 0x562c3e, block: 'Warped Hyphae', blockId: 'minecraft:warped_hyphae' },
  { id: 58, rgb: 0x14b485, block: 'Warped Wart Block', blockId: 'minecraft:warped_wart_block' },
  { id: 59, rgb: 0x646464, block: 'Cobbled Deepslate', blockId: 'minecraft:cobbled_deepslate' },
  { id: 60, rgb: 0xd8af93, block: 'Block of Raw Iron', blockId: 'minecraft:raw_iron_block', expensive: true },
  { id: 61, rgb: 0x7fa796, block: 'Verdant Froglight', blockId: 'minecraft:verdant_froglight', expensive: true },
];

/** The row of blocks north of the art that gives the first row the right shade. Its own color never shows. */
export const SUPPORT_BLOCK = { block: 'Cobblestone', blockId: 'minecraft:cobblestone' };

/** Shade multipliers by shade index: 0 = lower than north, 1 = level, 2 = higher. */
export const SHADES = [180, 220, 255] as const;

export type PaletteEntry = { r: number; g: number; b: number; base: number; shade: number };

export function buildPalette(staircase: boolean, skipExpensive = false): PaletteEntry[] {
  const shades = staircase ? [0, 1, 2] : [1];
  const out: PaletteEntry[] = [];
  for (const c of MAP_BASE) {
    if (skipExpensive && c.expensive) continue;
    for (const s of shades) {
      const m = SHADES[s];
      out.push({
        r: Math.floor((((c.rgb >> 16) & 255) * m) / 255),
        g: Math.floor((((c.rgb >> 8) & 255) * m) / 255),
        b: Math.floor(((c.rgb & 255) * m) / 255),
        base: c.id,
        shade: s,
      });
    }
  }
  return out;
}

export const baseById = new Map(MAP_BASE.map((b) => [b.id, b]));
