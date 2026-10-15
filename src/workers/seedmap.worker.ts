/// <reference lib="webworker" />
// Runs cubiomes (compiled to WebAssembly, see scripts/build-cubiomes.mjs) for the seed map:
// biome tiles as images, structure positions, and biome names for the legend.
import wasmUrl from './cubiomes.wasm?url';

type Exports = {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  sm_str: () => number;
  sm_str2mc: () => number;
  sm_init: (mc: number, seed: bigint, large: number) => void;
  sm_biomes: (scale: number, x: number, z: number, w: number, h: number, y: number) => number;
  sm_structures: (type: number, x0: number, z0: number, x1: number, z1: number) => number;
  sm_out: () => number;
  sm_spawn: () => number;
  sm_biome_name: (id: number) => number;
  sm_biome_color: (id: number) => number;
  sm_const: (i: number) => number;
};

export type World = { version: string; seed: string; large: boolean };

export type SeedMapRequest =
  | { id: number; kind: 'tile'; world: World; scale: number; x: number; z: number; size: number }
  | { id: number; kind: 'structures'; world: World; types: number[]; x0: number; z0: number; x1: number; z1: number }
  | { id: number; kind: 'meta'; world: World }
  | { id: number; kind: 'spawn'; world: World };

export type TileResult = { bitmap: ImageBitmap; ids: Uint8Array };
export type StructuresResult = { type: number; x: number; z: number }[][];
/** Biome names and colors by id, and cubiomes' StructureType numbers in sm_const order. */
export type MetaResult = { mc: number; names: string[]; colors: number[]; structureIds: number[] };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// cubiomes is built for WASI but never really talks to the outside world: stub every import.
const wasi = new Proxy({}, { get: () => () => 0 });
const ready: Promise<Exports> = WebAssembly.instantiateStreaming(fetch(wasmUrl), { wasi_snapshot_preview1: wasi }).then((r) => {
  const w = r.instance.exports as unknown as Exports;
  w._initialize();
  return w;
});

let current = '';
let colors: Uint32Array | null = null;

function mcOf(w: Exports, version: string) {
  // Memory can grow during any call, so views on it are always made fresh, after the call.
  new Uint8Array(w.memory.buffer).set(new TextEncoder().encode(`${version}\0`), w.sm_str());
  return w.sm_str2mc();
}

function use(w: Exports, world: World) {
  const key = `${world.version}|${world.seed}|${world.large}`;
  if (key === current) return;
  const mc = mcOf(w, world.version);
  if (!mc) throw new Error(`Unknown version ${world.version}`);
  w.sm_init(mc, BigInt.asUintN(64, BigInt(world.seed)), world.large ? 1 : 0);
  current = key;
}

function palette(w: Exports) {
  if (!colors) {
    // RGBA as one little-endian uint32 per biome id: 0xAABBGGRR.
    colors = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = w.sm_biome_color(i);
      colors[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    }
  }
  return colors;
}

function cstr(w: Exports, p: number) {
  const m = new Uint8Array(w.memory.buffer);
  let e = p;
  while (m[e]) e++;
  return new TextDecoder().decode(m.subarray(p, e));
}

async function handle(req: SeedMapRequest): Promise<{ result: unknown; transfer: Transferable[] }> {
  const w = await ready;
  use(w, req.world);
  if (req.kind === 'tile') {
    const { scale, x, z, size } = req;
    // Biomes near sea level (y = 15 at 1:4 is block 60–63), the usual height for seed maps.
    const p = w.sm_biomes(scale, x, z, size, size, 15);
    if (!p) throw new Error('Biome generation failed');
    const src = new Int32Array(w.memory.buffer, p, size * size);
    const ids = new Uint8Array(size * size);
    const rgba = new Uint32Array(size * size);
    const pal = palette(w);
    for (let i = 0; i < src.length; i++) {
      const id = src[i] & 0xff;
      ids[i] = id;
      rgba[i] = pal[id];
    }
    const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer), size, size));
    return { result: { bitmap, ids } satisfies TileResult, transfer: [bitmap, ids.buffer] };
  }
  if (req.kind === 'structures') {
    const out: StructuresResult = [];
    for (const type of req.types) {
      const n = w.sm_structures(type, req.x0, req.z0, req.x1, req.z1);
      const list: StructuresResult[number] = [];
      if (n > 0) {
        const xs = new Int32Array(w.memory.buffer, w.sm_out(), n * 2);
        for (let i = 0; i < n; i++) list.push({ type, x: xs[2 * i], z: xs[2 * i + 1] });
      }
      out.push(list);
    }
    return { result: out, transfer: [] };
  }
  if (req.kind === 'spawn') {
    const p = w.sm_spawn();
    const xz = new Int32Array(w.memory.buffer, p, 2);
    return { result: { x: xz[0], z: xz[1] }, transfer: [] };
  }
  const names: string[] = [];
  const cols: number[] = [];
  for (let i = 0; i < 256; i++) {
    const p = w.sm_biome_name(i);
    names.push(p ? cstr(w, p) : '');
    cols.push(w.sm_biome_color(i));
  }
  const ids: number[] = [];
  for (let i = 0; w.sm_const(i) >= 0; i++) ids.push(w.sm_const(i));
  return { result: { mc: mcOf(w, req.world.version), names, colors: cols, structureIds: ids }, transfer: [] };
}

ctx.onmessage = async (e: MessageEvent<SeedMapRequest>) => {
  const req = e.data;
  try {
    const { result, transfer } = await handle(req);
    ctx.postMessage({ id: req.id, result }, transfer);
  } catch (err) {
    ctx.postMessage({ id: req.id, error: (err as Error).message });
  }
};
