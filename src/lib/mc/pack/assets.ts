import { createStore, get, set } from 'idb-keyval';
import { listVersions } from './vanilla';
import { t } from '../../i18n-core';

/**
 * Minecraft's asset objects: the files that aren't in the client jar (sounds, sounds.json, languages
 * other than English, the menu panorama). Their list (the asset index) comes from piston-meta, which
 * sends CORS headers; the files themselves from resources.download.minecraft.net through the site's
 * own server (/mc-assets in vite.config.ts), as that host sends none. Every file is checked against
 * its SHA-1, and small ones are kept in IndexedDB, so they are downloaded once.
 */
export type AssetIndex = Record<string, { hash: string; size: number }>;

const store = createStore('unktilz-mc-assets', 'objects');
const indexes = new Map<string, Promise<AssetIndex>>();
const memory = new Map<string, Promise<Uint8Array>>();
/** Files up to this size are kept in the browser (sounds.json, languages, panorama, short sounds). */
const KEEP_BYTES = 2_000_000;

export class AssetsUnavailable extends Error {}

/** The asset index of a version (by its id, e.g. "26.3"). Needs the internet the first time. */
export function assetIndex(versionId: string): Promise<AssetIndex> {
  let p = indexes.get(versionId);
  if (!p) {
    p = (async () => {
      const saved = await get<AssetIndex>(`index:${versionId}`, store).catch(() => undefined);
      if (saved) return saved;
      const info = (await listVersions().catch(() => [])).find((v) => v.id === versionId);
      if (!info) throw new AssetsUnavailable(t('The list of the game’s sounds and languages needs the internet once.'));
      const meta = (await fetch(info.url).then((r) => r.json())) as { assetIndex?: { url: string } };
      if (!meta.assetIndex) throw new AssetsUnavailable(t('Mojang has no sound list for this version.'));
      const idx = ((await fetch(meta.assetIndex.url).then((r) => r.json())) as { objects: AssetIndex }).objects;
      set(`index:${versionId}`, idx, store).catch(() => {});
      return idx;
    })();
    p.catch(() => indexes.delete(versionId));
    indexes.set(versionId, p);
  }
  return p;
}

async function sha1(bytes: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes as BufferSource));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One asset object by its hash, checked; cached in memory and (small ones) in the browser. */
export function assetObject(hash: string): Promise<Uint8Array> {
  let p = memory.get(hash);
  if (!p) {
    p = (async () => {
      const saved = await get<Uint8Array>(hash, store).catch(() => undefined);
      if (saved) return saved;
      let res: Response;
      try {
        res = await fetch(`/mc-assets/${hash.slice(0, 2)}/${hash}`);
      } catch {
        throw new AssetsUnavailable(t('Mojang’s sound server can’t be reached. Check your internet connection.'));
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      // A static host without the /mc-assets pass-through answers with its own page (or 404).
      if (!res.ok || (await sha1(bytes)) !== hash) throw new AssetsUnavailable(t('The game’s sounds, languages and menu panorama come through the site’s own server: open the site with start.bat (or npm run dev / preview).'));
      if (bytes.length <= KEEP_BYTES) set(hash, bytes, store).catch(() => {});
      return bytes;
    })();
    p.catch(() => memory.delete(hash));
    memory.set(hash, p);
  }
  return p;
}

/** An asset by its path in the index ("minecraft/sounds.json"); null when the version has none. */
export async function assetFile(versionId: string, path: string): Promise<Uint8Array | null> {
  const idx = await assetIndex(versionId);
  const e = idx[path];
  return e ? assetObject(e.hash) : null;
}
