import type { MetaResult, SeedMapRequest, StructuresResult, TileResult, World } from '../../workers/seedmap.worker';

export type { World };

/** Versions the map offers, newest first. `id` is what cubiomes' str2mc understands. */
export const VERSIONS = [
  { id: '26.3', label: '26.3' },
  { id: '26.2', label: '26.2' },
  { id: '26.1', label: '26.1' },
  { id: '1.21.11', label: '1.21.11' },
  { id: '1.21.9', label: '1.21.9 – 1.21.10' },
  { id: '1.21.6', label: '1.21.6 – 1.21.8' },
  { id: '1.21.5', label: '1.21.5' },
  { id: '1.21.4', label: '1.21.4' },
  { id: '1.21.3', label: '1.21.2 – 1.21.3' },
  { id: '1.21.1', label: '1.21 – 1.21.1' },
  { id: '1.20', label: '1.20' },
  { id: '1.19', label: '1.19.3 – 1.19.4' },
  { id: '1.19.2', label: '1.19 – 1.19.2' },
  { id: '1.18', label: '1.18' },
  { id: '1.17', label: '1.17' },
  { id: '1.16', label: '1.16' },
] as const;

/**
 * Structure types, in the order of sm_const() in scripts/seedmap.c. `maxBpp`: hidden when the map is
 * zoomed out further than this many blocks per screen pixel (common ones would just be clutter).
 */
export const STRUCTURES = [
  { key: 'village', name: 'Village', color: '#f2b13c', on: true, maxBpp: 24 },
  { key: 'desert_pyramid', name: 'Desert temple', color: '#e8d27c', on: true, maxBpp: 24 },
  { key: 'jungle_temple', name: 'Jungle temple', color: '#5fbf4a', on: true, maxBpp: 24 },
  { key: 'swamp_hut', name: 'Witch hut', color: '#7d58c9', on: true, maxBpp: 24 },
  { key: 'igloo', name: 'Igloo', color: '#bfe6ff', on: false, maxBpp: 24 },
  { key: 'ocean_ruin', name: 'Ocean ruins', color: '#3fa7a0', on: false, maxBpp: 6 },
  { key: 'shipwreck', name: 'Shipwreck', color: '#9c6b3f', on: false, maxBpp: 6 },
  { key: 'monument', name: 'Ocean monument', color: '#33c3e8', on: true, maxBpp: 48 },
  { key: 'mansion', name: 'Woodland mansion', color: '#a0522d', on: true, maxBpp: 96 },
  { key: 'outpost', name: 'Pillager outpost', color: '#d8573e', on: true, maxBpp: 24 },
  { key: 'ruined_portal', name: 'Ruined portal', color: '#b44cd6', on: false, maxBpp: 8 },
  { key: 'ancient_city', name: 'Ancient city', color: '#1f6f8b', on: true, maxBpp: 48, since: '1.19.2' },
  { key: 'treasure', name: 'Buried treasure', color: '#f5e050', on: false, maxBpp: 3 },
  { key: 'trail_ruins', name: 'Trail ruins', color: '#c98a5a', on: false, maxBpp: 24, since: '1.20' },
  { key: 'trial_chambers', name: 'Trial chambers', color: '#d9883b', on: true, maxBpp: 24, since: '1.21.1' },
  { key: 'abandoned_camp', name: 'Abandoned camp', color: '#8fbf6a', on: true, maxBpp: 24, since: '26.3' },
] as const;
export type StructureKey = (typeof STRUCTURES)[number]['key'];

const SEA_LEVEL = 63;

/** Biome samples per tile side. Smaller tiles appear sooner; 1.18+ generation is ~8 µs a sample. */
export const TILE = 128;
/** Structures are looked up in squares this many blocks wide. */
export const SREGION = 2048;

export const worldKey = (w: World) => `${w.version}|${w.seed}|${w.large ? 'L' : ''}`;

// Omit<> on a union would merge the variants; this keeps each one.
type Request = SeedMapRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

type Job = {
  req: Request;
  /** Lower runs first; null = no longer needed, drop it. Asked again whenever a worker frees up. */
  priority: () => number | null;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

/**
 * A few workers, each with its own copy of the WebAssembly module. Jobs wait in one pool and the
 * most useful one (nearest the middle of the view) goes next, so panning stays responsive.
 */
export class SeedMapEngine {
  private workers: { w: Worker; busy: boolean }[] = [];
  private jobs: Job[] = [];
  private pending = new Map<number, Job>();
  private nextId = 1;

  constructor(count = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('../../workers/seedmap.worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      w.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const job = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        slot.busy = false;
        if (job) {
          if (e.data.error) job.reject(new Error(e.data.error));
          else job.resolve(e.data.result);
        }
        this.pump();
      };
      this.workers.push(slot);
    }
  }

  private run<T>(req: Job['req'], priority: Job['priority']): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({ req, priority, resolve: resolve as (v: unknown) => void, reject });
      this.pump();
    });
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      let best = -1;
      let bestP = Infinity;
      for (let i = 0; i < this.jobs.length; i++) {
        const p = this.jobs[i].priority();
        if (p === null) {
          this.jobs[i].reject(new Error('cancelled'));
          this.jobs.splice(i--, 1);
        } else if (p < bestP) {
          bestP = p;
          best = i;
        }
      }
      if (best < 0) return;
      const job = this.jobs.splice(best, 1)[0];
      const id = this.nextId++;
      this.pending.set(id, job);
      slot.busy = true;
      slot.w.postMessage({ ...job.req, id });
    }
  }

  tile(world: World, scale: number, tx: number, tz: number, priority: Job['priority']) {
    return this.run<TileResult>({ kind: 'tile', world, scale, x: tx * TILE, z: tz * TILE, size: TILE }, priority);
  }

  structures(world: World, types: number[], rx: number, rz: number, priority: Job['priority']) {
    const x0 = rx * SREGION;
    const z0 = rz * SREGION;
    return this.run<StructuresResult>({ kind: 'structures', world, types, x0, z0, x1: x0 + SREGION, z1: z0 + SREGION }, priority);
  }

  /**
   * Y to stand at on (x, z): ground level from the real terrain, or the water surface (63) when
   * the ground is under the sea. Costs a few milliseconds, so it's asked for one spot at a time.
   */
  async standY(world: World, x: number, z: number) {
    const ground = await this.run<number>({ kind: 'ground', world, x, z }, () => -2);
    return Math.max(ground, SEA_LEVEL);
  }

  /** Where the player first appears in the world. */
  spawn(world: World) {
    return this.run<{ x: number; z: number }>({ kind: 'spawn', world }, () => -1);
  }

  meta(world: World) {
    return this.run<MetaResult>({ kind: 'meta', world }, () => -1);
  }

  /** Drops everything still waiting (e.g. the seed changed). */
  clear() {
    for (const j of this.jobs) j.reject(new Error('cancelled'));
    this.jobs = [];
  }

  dispose() {
    this.clear();
    for (const s of this.workers) s.w.terminate();
  }
}

/** Sample scale for a zoom: the coarsest that still gives about a sample per screen pixel. */
export function scaleFor(bpp: number) {
  for (const s of [4, 16, 64, 256]) if (s * 1.5 >= bpp) return s;
  return 256;
}

/** A random 64-bit seed, as the game would pick one. */
export function randomSeed() {
  const b = new BigInt64Array(1);
  crypto.getRandomValues(b);
  return b[0].toString();
}

/** Whether a structure exists in a version (by its `since`, the oldest VERSIONS id that has it). */
export function inVersion(i: number, version: string) {
  const since = (STRUCTURES[i] as { since?: string }).since;
  if (!since) return true;
  const order = VERSIONS.map((v) => v.id as string);
  return order.indexOf(version) <= order.indexOf(since);
}

/** "dark_forest" → "Dark forest" */
export const biomeLabel = (name: string) => (name ? name[0].toUpperCase() + name.slice(1).replace(/_/g, ' ') : 'Unknown');

/** Line-art icons (24×24, stroked) used on the map and in the list. */
export const STRUCTURE_ICONS: Record<StructureKey, string> = {
  village: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  desert_pyramid: 'M2 20h20M4 20l8-14 8 14M9 14h6',
  jungle_temple: 'M3 20h18M5 20v-4h14v4M7 16v-4h10v4M9 12V8h6v4M11 8V5h2v3',
  swamp_hut: 'M3 19h18M7 19c2-3 2.5-8 5-15 2.5 7 3 12 5 15M8.5 15h7',
  igloo: 'M3 19h18M4 19a8 8 0 0 1 16 0M10 19v-3a2 2 0 0 1 4 0v3',
  ocean_ruin: 'M5 20h14M8 20V9M12 20v-8M16 20v-5M6 9l3-3 3 2 3-2 3 3',
  shipwreck: 'M3 15h18l-3 5H6zM12 15V4M12 5l6 7h-6',
  monument: 'M12 21V8M6 4v4a6 6 0 0 0 12 0V4M12 3v5',
  mansion: 'M3 20h18M4 20V10l4-4 4 4 4-4 4 4v10M10 20v-4h4v4M7 13h1M16 13h1',
  outpost: 'M8 21V10h8v11M7 10h10M8 7h2v3M14 7h2v3M12 10V3l5 2-5 2',
  ruined_portal: 'M6 21V3h12v18M9.5 6.5v11h5v-11z',
  ancient_city: 'M4 21V11a8 8 0 0 1 16 0v10M8.5 21v-9a3.5 3.5 0 0 1 7 0v9',
  treasure: 'M4 10h16v10H4zM4 10l2-5h12l2 5M10.5 12.5h3v3h-3z',
  trail_ruins: 'M9 4h6M10 4v3c-4 2-5 6-3 12h10c2-6 1-10-3-12V4',
  trial_chambers: 'M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM11.2 11.2 20 20M16 16l2-2M18.5 18.5l2-2',
  abandoned_camp: 'M2 20h20M4 20 12 5l8 15M12 5v15M9.5 20l2.5-5 2.5 5M10 4l2 1 2-1',
};
