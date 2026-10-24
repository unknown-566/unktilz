import { fillBox, type BlockSpec, type Pos } from '../../../lib/mc/blocks';

/** A box of whole blocks: from `min` to `max` inclusive, in blocks from where the command runs. */
export type Box = { min: [number, number, number]; max: [number, number, number] };

export type BlockView = {
  /** rel: around you (~); local: in front of you (^, shown as if you look south); abs: exact coordinates (no "you"). */
  frame: 'rel' | 'local' | 'abs';
  /** The whole area (one block for /setblock). */
  area: Box;
  /** How a big fill is split (more than one piece). */
  pieces: Box[];
  /** How the area looks: solid blocks, see-through (only air / only some blocks), walls only, walls with the inside kept. */
  look: 'solid' | 'partial' | 'hollow' | 'outline' | 'clear';
  color: string;
  /** Glass and the like: drawn see-through. */
  glassy: boolean;
};

const num = (c: string) => Number(c.replace(/^[~^]/, '') || 0);

/** One coordinate triple in blocks; ^left ^up ^forward turns into x, y, z when facing south. */
function point(p: Pos): { frame: BlockView['frame']; at: [number, number, number] } | null {
  const c = p.map((x) => x.trim().replace(/\s+/g, '') || '~');
  const kinds = c.map((x) => (x.startsWith('~') ? 'rel' : x.startsWith('^') ? 'local' : 'abs'));
  const at = c.map(num);
  if (at.some((n) => !Number.isFinite(n))) return null;
  if (kinds.every((k) => k === 'local')) return { frame: 'local', at: [Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2])] };
  if (kinds.some((k) => k === 'local')) return null;
  // Exact and ~ mixed in one position: drawn around you, the exact parts can't be.
  const frame = kinds.every((k) => k === 'abs') ? 'abs' : 'rel';
  if (frame === 'rel' && kinds.some((k) => k === 'abs')) return null;
  return { frame, at: [Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2])] };
}

/** A block id's rough color, from the words in it (wool colors, stone, wood, glass…). */
export function blockColor(id: string): { color: string; glassy: boolean } {
  const b = id.replace(/^minecraft:/, '');
  const glassy = /glass|ice$|^ice|barrier|light$/.test(b) && !/packed_ice|blue_ice/.test(b);
  const dyes: [string, string][] = [
    ['light_blue', '#3ab3da'],
    ['light_gray', '#9d9d97'],
    ['white', '#e9ecec'],
    ['orange', '#f07613'],
    ['magenta', '#bd44b3'],
    ['yellow', '#f8c527'],
    ['lime', '#70b919'],
    ['pink', '#ed8dac'],
    ['gray', '#3e4447'],
    ['cyan', '#158991'],
    ['purple', '#792aac'],
    ['blue', '#35399d'],
    ['brown', '#724728'],
    ['green', '#546d1b'],
    ['red', '#a12722'],
    ['black', '#141519'],
  ];
  for (const [name, hex] of dyes) if (b.startsWith(`${name}_`)) return { color: hex, glassy };
  const words: [RegExp, string][] = [
    [/^air$|cave_air|void_air/, '#ff5c5c'],
    [/water/, '#3f76e4'],
    [/lava|magma/, '#d96415'],
    [/diamond/, '#5decf5'],
    [/emerald/, '#17dd62'],
    [/gold/, '#f9d849'],
    [/iron/, '#d8d8d8'],
    [/netherite|obsidian|blackstone|basalt/, '#3b3236'],
    [/redstone/, '#b01d0c'],
    [/lapis/, '#2a54b8'],
    [/copper/, '#c06c4f'],
    [/amethyst/, '#9a5cc6'],
    [/quartz|snow|calcite|bone/, '#ece6df'],
    [/glass|ice/, '#a9d8f0'],
    [/grass|moss|leaves|vine|fern|cactus|kelp|slime/, '#5fa13a'],
    [/dirt|mud|podzol|farmland|path|soul/, '#866043'],
    [/sand|end_stone/, '#dbd3a0'],
    [/clay/, '#a0a6b3'],
    [/netherrack|nether_brick|crimson|nether_wart/, '#723232'],
    [/warped/, '#2b6963'],
    [/prismarine/, '#5aa18f'],
    [/purpur/, '#a77ba7'],
    [/tnt/, '#db441a'],
    [/bricks?$/, '#966253'],
    [/pumpkin|melon|hay/, '#c88a20'],
    [/birch/, '#c8b77a'],
    [/spruce|dark_oak|mangrove/, '#5a3d24'],
    [/oak|planks|log|wood|jungle|acacia|cherry|bamboo|chest|barrel|crafting|bookshelf|sign|lectern|jukebox/, '#a0794a'],
    [/deepslate|tuff|cobbled|gravel|andesite|stone|furnace|dispenser|dropper|hopper|anvil|cauldron|spawner/, '#7d7d7d'],
    [/diorite/, '#bcbcbc'],
    [/granite/, '#9a6a59'],
    [/command_block/, '#c47a3f'],
    [/beacon/, '#7fe7e0'],
    [/bedrock/, '#555555'],
  ];
  for (const [re, hex] of words) if (re.test(b)) return { color: hex, glassy };
  return { color: '', glassy };
}

/** What to draw for the settings, or null when it can't be placed (mixed or broken coordinates). */
export function blockView(spec: BlockSpec, commands: string[]): BlockView | null {
  const { color, glassy } = blockColor(spec.block);
  const air = /^(minecraft:)?(cave_|void_)?air$/.test(spec.block.trim());
  if (spec.mode === 'setblock') {
    const p = point(spec.pos);
    if (!p) return null;
    return { frame: p.frame, area: { min: p.at, max: p.at }, pieces: [], look: air ? 'clear' : spec.how === 'keep' ? 'partial' : 'solid', color, glassy };
  }
  const a = point(spec.pos);
  const b = point(spec.to);
  if (!a || !b || a.frame !== b.frame) return null;
  const area: Box = {
    min: [0, 1, 2].map((i) => Math.min(a.at[i], b.at[i])) as Box['min'],
    max: [0, 1, 2].map((i) => Math.max(a.at[i], b.at[i])) as Box['max'],
  };
  // The pieces of a split fill, read back from its commands.
  const pieces: Box[] = [];
  if (commands.length > 1 && fillBox(spec.pos, spec.to))
    for (const c of commands) {
      const n = c.split(' ').slice(1, 7).map(num);
      pieces.push({ min: [n[0], n[1], n[2]], max: [n[3], n[4], n[5]] });
    }
  const look: BlockView['look'] = air
    ? 'clear'
    : spec.how === 'hollow'
      ? 'hollow'
      : spec.how === 'outline'
        ? 'outline'
        : spec.how === 'keep' || spec.filter.trim()
          ? 'partial'
          : 'solid';
  return { frame: a.frame, area, pieces, look, color, glassy };
}
