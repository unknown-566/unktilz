import type { MetaResult, SeedMapRequest, StructuresResult, TileResult, World } from '../../workers/seedmap.worker';

export type { World };

/** Versions the map offers, newest first. `id` is what cubiomes' str2mc understands. */
export const VERSIONS = [
  { id: '1.21', label: '1.21.4 – newest' },
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
  { key: 'village', name: 'Village', short: 'V', color: '#f2b13c', on: true, maxBpp: 24 },
  { key: 'desert_pyramid', name: 'Desert temple', short: 'D', color: '#e8d27c', on: true, maxBpp: 24 },
  { key: 'jungle_temple', name: 'Jungle temple', short: 'J', color: '#5fbf4a', on: true, maxBpp: 24 },
  { key: 'swamp_hut', name: 'Witch hut', short: 'W', color: '#7d58c9', on: true, maxBpp: 24 },
  { key: 'igloo', name: 'Igloo', short: 'I', color: '#bfe6ff', on: false, maxBpp: 24 },
  { key: 'ocean_ruin', name: 'Ocean ruins', short: 'R', color: '#3fa7a0', on: false, maxBpp: 6 },
  { key: 'shipwreck', name: 'Shipwreck', short: 'S', color: '#9c6b3f', on: false, maxBpp: 6 },
  { key: 'monument', name: 'Ocean monument', short: 'M', color: '#33c3e8', on: true, maxBpp: 48 },
  { key: 'mansion', name: 'Woodland mansion', short: 'WM', color: '#a0522d', on: true, maxBpp: 96 },
  { key: 'outpost', name: 'Pillager outpost', short: 'O', color: '#d8573e', on: true, maxBpp: 24 },
  { key: 'ruined_portal', name: 'Ruined portal', short: 'P', color: '#b44cd6', on: false, maxBpp: 8 },
  { key: 'ancient_city', name: 'Ancient city', short: 'A', color: '#1f6f8b', on: true, maxBpp: 48, since: '1.19.2' },
  { key: 'treasure', name: 'Buried treasure', short: 'T', color: '#f5e050', on: false, maxBpp: 3 },
  { key: 'trail_ruins', name: 'Trail ruins', short: 'TR', color: '#c98a5a', on: false, maxBpp: 24, since: '1.20' },
  { key: 'trial_chambers', name: 'Trial chambers', short: 'TC', color: '#d9883b', on: true, maxBpp: 24, since: '1.21.1' },
] as const;
export type StructureKey = (typeof STRUCTURES)[number]['key'];

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
