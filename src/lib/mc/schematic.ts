import { nbt, packBits, writeNbtFile, type Tag } from '../nbt';
import { SUPPORT_BLOCK, baseById, type PaletteEntry } from './mapColors';

/** A converted picture: one palette index per pixel, row by row from the north-west corner. */
export type MapGrid = {
  width: number;
  height: number;
  /** Index into `palette`; EMPTY where the picture was transparent. */
  idx: Uint8Array;
  palette: PaletteEntry[];
};

export const EMPTY = 255;

/**
 * Heights for the columns x0..x1 and rows z0..z1. Row 0 of the result is the support row (“noobline”)
 * just north of the art; rows 1..n are the art.
 *
 * A map shades a block light when it stands higher than the block north of it, dark when lower and
 * normal when level. Only the direction matters, not by how much, so each column gets the lowest
 * heights that keep every relation: a block's height is the longer of the climb that leads up to it
 * from the north and the descent that follows it to the south. A column drops back to 0 as soon as it
 * can instead of creeping upwards across a whole gradient.
 */
export function buildHeights(g: MapGrid, x0: number, x1: number, z0: number, z1: number, staircase: boolean) {
  const w = x1 - x0;
  const rows = z1 - z0 + 1;
  const h = new Int16Array(w * rows);
  if (!staircase) return { h, w, rows, buildHeight: 1 };

  // rel[z]: +1 = row z higher than row z−1, −1 = lower, 0 = level (or nothing to compare).
  const rel = new Int8Array(rows);
  const up = new Int16Array(rows);
  const down = new Int16Array(rows);
  let maxY = 0;
  for (let x = 0; x < w; x++) {
    for (let z = 1; z < rows; z++) {
      const e = g.idx[(z0 + z - 1) * g.width + x0 + x];
      const shade = e === EMPTY ? 1 : g.palette[e].shade;
      rel[z] = shade === 2 ? 1 : shade === 0 ? -1 : 0;
    }
    up[0] = 0;
    for (let z = 1; z < rows; z++) up[z] = rel[z] > 0 ? up[z - 1] + 1 : rel[z] === 0 ? up[z - 1] : 0;
    down[rows - 1] = 0;
    for (let z = rows - 1; z > 0; z--) down[z - 1] = rel[z] < 0 ? down[z] + 1 : rel[z] === 0 ? down[z] : 0;
    for (let z = 0; z < rows; z++) {
      const y = Math.max(up[z], down[z]);
      h[z * w + x] = y;
      if (y > maxY) maxY = y;
    }
  }
  return { h, w, rows, buildHeight: maxY + 1 };
}

type BlockState = { blockId: string; props?: Record<string, string> };

const stateKey = (s: BlockState) => `${s.blockId}${s.props ? JSON.stringify(s.props) : ''}`;
const stateTag = (s: BlockState): Tag =>
  nbt.compound({
    Name: nbt.str(s.blockId),
    ...(s.props ? { Properties: nbt.compound(Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, nbt.str(v)]))) } : {}),
  });

/** Block state for a pixel, or null where the picture is transparent. */
function stateAt(g: MapGrid, x: number, z: number): BlockState | null {
  const e = g.idx[z * g.width + x];
  if (e === EMPTY) return null;
  const base = baseById.get(g.palette[e].base)!;
  return { blockId: base.blockId, props: base.props };
}

/**
 * Vanilla structure file (.nbt) for one rectangle of the art, support row included.
 * Positions left out are “structure void”, so placing it doesn't clear what is around it.
 */
export function toStructureNbt(g: MapGrid, x0: number, x1: number, z0: number, z1: number, staircase: boolean, dataVersion: number): Uint8Array {
  const { h, w, rows, buildHeight } = buildHeights(g, x0, x1, z0, z1, staircase);
  const palette: BlockState[] = [];
  const ids = new Map<string, number>();
  const idFor = (s: BlockState) => {
    const k = stateKey(s);
    let i = ids.get(k);
    if (i === undefined) {
      i = palette.length;
      palette.push(s);
      ids.set(k, i);
    }
    return i;
  };
  const blocks: Tag[] = [];
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < w; x++) {
      const s = z === 0 ? { blockId: SUPPORT_BLOCK.blockId } : stateAt(g, x0 + x, z0 + z - 1);
      if (!s) continue;
      blocks.push(nbt.compound({ state: nbt.int(idFor(s)), pos: nbt.intList(x, h[z * w + x], z) }));
    }
  }
  return writeNbtFile({
    DataVersion: nbt.int(dataVersion),
    size: nbt.intList(w, buildHeight, rows),
    palette: nbt.list('compound', palette.map(stateTag)),
    blocks: nbt.list('compound', blocks),
    entities: nbt.list('compound', []),
  });
}

/** Litematica schematic (format version 6) of the whole art as one region, support row included. */
export function toLitematic(g: MapGrid, staircase: boolean, dataVersion: number, name: string): Uint8Array {
  const { h, w, rows, buildHeight } = buildHeights(g, 0, g.width, 0, g.height, staircase);
  // Palette index 0 must be air, as Litematica's own palettes start with it.
  const palette: BlockState[] = [{ blockId: 'minecraft:air' }];
  const ids = new Map<string, number>([[stateKey(palette[0]), 0]]);
  const idFor = (s: BlockState) => {
    const k = stateKey(s);
    let i = ids.get(k);
    if (i === undefined) {
      i = palette.length;
      palette.push(s);
      ids.set(k, i);
    }
    return i;
  };
  const layer = w * rows;
  const volume = layer * buildHeight;
  const values = new Uint16Array(volume);
  let total = 0;
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < w; x++) {
      const s = z === 0 ? { blockId: SUPPORT_BLOCK.blockId } : stateAt(g, x, z - 1);
      if (!s) continue;
      values[h[z * w + x] * layer + z * w + x] = idFor(s);
      total++;
    }
  }
  const size = palette.length - 1;
  const bits = Math.max(2, size === 0 ? 0 : 32 - Math.clz32(size));
  const pos = (x: number, y: number, z: number) => nbt.compound({ x: nbt.int(x), y: nbt.int(y), z: nbt.int(z) });
  const now = Date.now();
  return writeNbtFile({
    MinecraftDataVersion: nbt.int(dataVersion),
    Version: nbt.int(6),
    SubVersion: nbt.int(1),
    Metadata: nbt.compound({
      Name: nbt.str(name),
      Author: nbt.str('unktilz'),
      Description: nbt.str('Map art. Build it in the Overworld, then hold an empty map over the middle of each 128×128 area.'),
      RegionCount: nbt.int(1),
      TotalVolume: nbt.int(volume),
      TotalBlocks: nbt.int(total),
      TimeCreated: nbt.long(now),
      TimeModified: nbt.long(now),
      EnclosingSize: pos(w, buildHeight, rows),
    }),
    Regions: nbt.compound({
      [name]: nbt.compound({
        Position: pos(0, 0, 0),
        Size: pos(w, buildHeight, rows),
        BlockStatePalette: nbt.list('compound', palette.map(stateTag)),
        BlockStates: nbt.longWords(packBits(values, bits)),
        TileEntities: nbt.list('compound', []),
        Entities: nbt.list('compound', []),
        PendingBlockTicks: nbt.list('compound', []),
        PendingFluidTicks: nbt.list('compound', []),
      }),
    }),
  });
}

/** Block counts per map color id, plus the support rows. */
export function countBlocks(g: MapGrid) {
  const counts = new Map<number, number>();
  for (const e of g.idx) {
    if (e === EMPTY) continue;
    const base = g.palette[e].base;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return counts;
}
