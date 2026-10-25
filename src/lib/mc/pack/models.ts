import { strFromU8 } from 'fflate';

/**
 * Block and item models from the game's files (minecraft.wiki, Model): a model names a parent and
 * textures ("#side" points at another texture name), and has `elements` (boxes, each with up to six
 * faces) or is a flat item ("builtin/generated", made of its layer0, layer1… textures).
 */
export type Dir = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
export type V3 = [number, number, number];
export type Face = {
  /** Picture path below assets/minecraft/ ("textures/block/stone.png"), or a custom key. */
  texture: string;
  /** u1, v1, u2, v2 in 0…16 of the texture. */
  uv: [number, number, number, number];
  rotation: 0 | 90 | 180 | 270;
  /** Colored by the game (grass, leaves…). */
  tint: boolean;
};
export type Element = {
  from: V3;
  to: V3;
  rotation?: { origin: V3; axis: 'x' | 'y' | 'z'; angle: number; rescale: boolean };
  shade: boolean;
  faces: Partial<Record<Dir, Face>>;
};
export type Model = { kind: 'elements'; elements: Element[] } | { kind: 'generated'; layers: string[] };

type RawFace = { texture?: string; uv?: number[]; rotation?: number; tintindex?: number };
type RawElement = { from?: number[]; to?: number[]; rotation?: { origin?: number[]; axis?: string; angle?: number; rescale?: boolean }; shade?: boolean; faces?: Record<string, RawFace> };
/** A texture name: "block/stone", "#side", or (26.x) { sprite: "block/stone", force_translucent: true }. */
type RawTexture = string | { sprite?: string };
type RawModel = { parent?: string; textures?: Record<string, RawTexture>; elements?: RawElement[] };
const spriteOf = (v: RawTexture | undefined): string | undefined => (typeof v === "string" ? v : v && typeof v === "object" && typeof v.sprite === "string" ? v.sprite : undefined);

const DIRS: Dir[] = ['down', 'up', 'north', 'south', 'west', 'east'];
type Files = Record<string, Uint8Array>;

const parsed = new WeakMap<Files, Map<string, RawModel | null>>();
function raw(files: Files, id: string): RawModel | null {
  let cache = parsed.get(files);
  if (!cache) parsed.set(files, (cache = new Map()));
  const key = id.replace(/^minecraft:/, '');
  if (cache.has(key)) return cache.get(key)!;
  const bytes = files[`models/${key}.json`];
  let m: RawModel | null = null;
  try {
    if (bytes) m = JSON.parse(strFromU8(bytes)) as RawModel;
  } catch {
    m = null;
  }
  cache.set(key, m);
  return m;
}

/** "minecraft:block/stone" or "block/stone" → "textures/block/stone.png" (other namespaces: as is). */
export const texturePath = (ref: string) => (ref.includes(':') && !ref.startsWith('minecraft:') ? ref : `textures/${ref.replace(/^minecraft:/, '')}.png`);

/** The UV a face gets when the model gives none: the part of the texture the box covers. */
function defaultUv(dir: Dir, f: V3, t: V3): [number, number, number, number] {
  const [x1, y1, z1] = f;
  const [x2, y2, z2] = t;
  switch (dir) {
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1];
    case 'up':
      return [x1, z1, x2, z2];
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1];
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1];
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

/** A model with its parents and texture names worked out; null when it can't be drawn. */
export function resolveModel(files: Files, id: string): Model | null {
  const textures: Record<string, string> = {};
  let elements: RawElement[] | undefined;
  let generated = false;
  let cur: string | undefined = id;
  for (let depth = 0; cur && depth < 24; depth++) {
    const name = cur.replace(/^minecraft:/, '');
    if (name === 'builtin/generated') {
      generated = true;
      break;
    }
    if (name.startsWith('builtin/')) return null;
    const m = raw(files, name);
    if (!m) return null;
    for (const [k, v] of Object.entries(m.textures ?? {})) {
      const sprite = spriteOf(v);
      if (sprite && !(k in textures)) textures[k] = sprite;
    }
    if (!elements && m.elements) elements = m.elements;
    cur = m.parent;
  }
  const look = (ref: string | undefined): string | null => {
    for (let i = 0; ref && i < 12; i++) {
      if (!ref.startsWith('#')) return texturePath(ref);
      ref = textures[ref.slice(1)];
    }
    return null;
  };
  if (generated && !elements) {
    const layers: string[] = [];
    for (let i = 0; i < 8; i++) {
      const p = look(textures[`layer${i}`]);
      if (!p) break;
      layers.push(p);
    }
    return layers.length ? { kind: 'generated', layers } : null;
  }
  if (!elements?.length) return null;
  const out: Element[] = [];
  for (const e of elements) {
    const from = (e.from ?? [0, 0, 0]).slice(0, 3) as V3;
    const to = (e.to ?? [16, 16, 16]).slice(0, 3) as V3;
    const faces: Partial<Record<Dir, Face>> = {};
    for (const dir of DIRS) {
      const f = e.faces?.[dir];
      if (!f) continue;
      const texture = look(f.texture);
      if (!texture) continue;
      const rot = (((Math.round((f.rotation ?? 0) / 90) * 90) % 360) + 360) % 360;
      faces[dir] = { texture, uv: (f.uv?.length === 4 ? f.uv : defaultUv(dir, from, to)) as Face['uv'], rotation: rot as Face['rotation'], tint: f.tintindex !== undefined };
    }
    const r = e.rotation;
    out.push({
      from,
      to,
      shade: e.shade !== false,
      faces,
      rotation: r && r.angle && (r.axis === 'x' || r.axis === 'y' || r.axis === 'z') ? { origin: (r.origin ?? [8, 8, 8]) as V3, axis: r.axis, angle: r.angle, rescale: !!r.rescale } : undefined,
    });
  }
  return { kind: 'elements', elements: out };
}

const indexes = new WeakMap<Files, Map<string, string[]>>();
/** Which block models name a texture directly (texture path → model ids). */
function textureIndex(files: Files): Map<string, string[]> {
  let idx = indexes.get(files);
  if (idx) return idx;
  idx = new Map();
  for (const path of Object.keys(files)) {
    const m = path.match(/^models\/(block\/.+)\.json$/);
    if (!m) continue;
    const model = raw(files, m[1]);
    for (const v of Object.values(model?.textures ?? {})) {
      const ref = spriteOf(v);
      if (!ref || ref.startsWith('#')) continue;
      const p = texturePath(ref);
      const list = idx.get(p) ?? [];
      list.push(m[1]);
      idx.set(p, list);
    }
  }
  indexes.set(files, idx);
  return idx;
}

/** A plain cube with the texture on every side (for block textures no model uses directly). */
const cubeOf = (texture: string): Model => ({
  kind: 'elements',
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], shade: true, faces: Object.fromEntries(DIRS.map((d) => [d, { texture, uv: defaultUv(d, [0, 0, 0], [16, 16, 16]), rotation: 0, tint: false }])) }],
});

/**
 * What to show in 3D for a texture: the block model that uses it (the one named like it, else the
 * shortest such name), the item model, or a flat item. Null for textures that aren't a block or
 * an item (mobs, GUI…).
 */
export function previewModel(files: Files, texPath: string): Model | null {
  const m = texPath.match(/^textures\/(block|item)\/(.+)\.png$/);
  if (!m) return null;
  const [, kind, stem] = m;
  if (kind === 'item') {
    const own = files[`models/item/${stem}.json`] ? resolveModel(files, `item/${stem}`) : null;
    if (own?.kind === 'generated' && own.layers.includes(texPath)) return own;
    return { kind: 'generated', layers: [texPath] };
  }
  const users = (textureIndex(files).get(texPath) ?? []).filter((id) => !/\/template_|_inventory$|_inner$|_outer$/.test(id));
  const base = stem.replace(/_(top|side|bottom|end|front|back|inner|overlay|particle)\d*$/, '');
  const ranked = [...users].sort((a, b) => {
    const score = (id: string) => (id === `block/${stem}` ? 0 : id === `block/${base}` ? 1 : 2);
    return score(a) - score(b) || a.length - b.length || a.localeCompare(b);
  });
  for (const id of ranked.slice(0, 6)) {
    const r = resolveModel(files, id);
    if (r?.kind === 'elements') return r;
  }
  return cubeOf(texPath);
}
