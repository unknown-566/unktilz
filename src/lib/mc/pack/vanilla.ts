import { createStore, del, entries, get, set } from 'idb-keyval';
import { computeValue } from '../../compute';
import { t } from '../../i18n-core';

/**
 * The game's own files (textures, models, texts…) for one Minecraft version, taken from its client
 * jar: downloaded from Mojang (piston-meta / piston-data send CORS headers) or read from the jar in
 * the player's .minecraft folder. Only about 6 MB of the 40 MB jar is kept, in IndexedDB, so a
 * version is downloaded once. Nothing of it is ever put into a pack unless the player changes it.
 */
export type Format = [major: number, minor: number];
export type Vanilla = {
  /** Version id, e.g. "26.3" or "1.21.4". */
  id: string;
  source: 'mojang' | 'jar';
  /** The resource pack format this version uses (from the jar's version.json). */
  format: Format;
  /** Paths below assets/minecraft/, e.g. "textures/block/stone.png". */
  files: Record<string, Uint8Array>;
  bytes: number;
  at: number;
};
export type VersionInfo = { id: string; url: string };

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
/** The oldest version the pack maker offers (the same as the command generators). */
const OLDEST = '1.20.5';
/** At most this many versions stay downloaded. */
const KEEP = 2;
const store = createStore('unktilz-mc-vanilla', 'versions');

/**
 * Resource pack formats of the releases (minecraft.wiki, Pack format), for "also works in older
 * versions". The loaded version's own format always comes from its jar, so a newer version than this
 * list still gets the right one.
 */
export const KNOWN_FORMATS: Record<string, Format> = {
  '1.20.5': [32, 0],
  '1.20.6': [32, 0],
  '1.21': [34, 0],
  '1.21.1': [34, 0],
  '1.21.2': [42, 0],
  '1.21.3': [42, 0],
  '1.21.4': [46, 0],
  '1.21.5': [55, 0],
  '1.21.6': [63, 0],
  '1.21.7': [64, 0],
  '1.21.8': [64, 0],
  '1.21.9': [69, 0],
  '1.21.10': [69, 0],
  '1.21.11': [75, 0],
  '26.1': [84, 0],
  '26.1.1': [84, 0],
  '26.1.2': [84, 0],
  '26.2': [88, 0],
  '26.3': [97, 1],
};

export const compareFormats = (a: Format, b: Format) => a[0] - b[0] || a[1] - b[1];

let versionsCache: Promise<VersionInfo[]> | null = null;

/** Releases from 1.20.5 up to the newest, newest first (from Mojang's version list). */
export function listVersions(): Promise<VersionInfo[]> {
  versionsCache ??= fetch(MANIFEST, { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ versions: { id: string; type: string; url: string }[] }>;
    })
    .then((m) => {
      const out: VersionInfo[] = [];
      for (const v of m.versions) {
        if (v.type !== 'release') continue;
        out.push({ id: v.id, url: v.url });
        if (v.id === OLDEST) break;
      }
      return out;
    })
    .catch((e) => {
      versionsCache = null;
      throw e;
    });
  return versionsCache;
}

/** The pack format in a jar's version.json: {resource_major, resource_minor} (1.21.9+) or {resource}. */
export function formatOf(versionJson: string | null): { id: string; format: Format } | null {
  if (!versionJson) return null;
  try {
    const v = JSON.parse(versionJson) as { id?: string; pack_version?: number | { resource?: number; resource_major?: number; resource_minor?: number } };
    const pv = v.pack_version;
    const format: Format | null =
      typeof pv === 'number' ? [pv, 0] : pv?.resource_major !== undefined ? [pv.resource_major, pv.resource_minor ?? 0] : pv?.resource !== undefined ? [pv.resource, 0] : null;
    return v.id && format ? { id: v.id, format } : null;
  } catch {
    return null;
  }
}

/** Downloaded versions, newest download first (without their files). */
export async function cachedVersions(): Promise<{ id: string; source: Vanilla['source']; bytes: number; at: number }[]> {
  const all = await entries<string, Vanilla>(store).catch(() => [] as [string, Vanilla][]);
  return all.map(([, v]) => ({ id: v.id, source: v.source, bytes: v.bytes, at: v.at })).sort((a, b) => b.at - a.at);
}

const memory = new Map<string, Vanilla>();

/** A version that's already downloaded, or undefined. */
export async function getCached(id: string): Promise<Vanilla | undefined> {
  if (memory.has(id)) return memory.get(id);
  const v = await get<Vanilla>(id, store).catch(() => undefined);
  if (v) {
    memory.set(id, v);
    // Mark it used, so the one dropped first is the one used longest ago.
    set(id, { ...v, at: Date.now() }, store).catch(() => {});
  }
  return v;
}

export async function forgetVersion(id: string) {
  memory.delete(id);
  await del(id, store).catch(() => {});
}

async function keep(v: Vanilla) {
  memory.set(v.id, v);
  await set(v.id, v, store);
  const all = await cachedVersions();
  for (const old of all.slice(KEEP)) if (old.id !== v.id) await forgetVersion(old.id);
}

async function fromJar(jar: Blob, source: Vanilla['source'], onProgress: (p: number) => void, expectId?: string): Promise<Vanilla> {
  const r = await computeValue('mc-jar-assets', { jar }, onProgress);
  const info = formatOf(r.versionJson);
  const id = info?.id ?? expectId;
  if (!id || !info) throw new Error(t('This jar has no version.json, so its version and pack format are unknown. Pick the game’s own .jar from .minecraft/versions/<version>/.'));
  const v: Vanilla = { id, source, format: info.format, files: r.files, bytes: r.bytes, at: Date.now() };
  await keep(v);
  return v;
}

/**
 * Downloads a version's client jar from Mojang (about 40 MB, with progress 0…0.85) and keeps the
 * files the pack maker uses (0.85…1).
 */
export async function downloadVersion(info: VersionInfo, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Vanilla> {
  const meta = (await fetch(info.url, { signal }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })) as { downloads?: { client?: { url: string; size: number } } };
  const client = meta.downloads?.client;
  if (!client) throw new Error(t('Mojang has no game file for {v}.', { v: info.id }));
  const res = await fetch(client.url, { signal });
  if (!res.ok || !res.body) throw new Error(String(res.status));
  const total = Number(res.headers.get('content-length')) || client.size;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress((got / total) * 0.85);
  }
  const jar = new Blob(parts as BlobPart[]);
  return fromJar(jar, 'mojang', (p) => onProgress(0.85 + p * 0.15), info.id);
}

/** Reads a client jar the player picked (works offline). */
export const readJar = (file: File, onProgress: (p: number) => void) => fromJar(file, 'jar', onProgress);
