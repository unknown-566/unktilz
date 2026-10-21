import { createStore, get, set } from 'idb-keyval';
import { SKIN, guessModel, upgradeLegacy, type Model } from '../../../lib/mc/skinLayout';
import type { Pixels } from '../../../lib/mc/skinOps';
import { lookupSkin } from '../../../lib/mc/uuid';
import { t } from '../../../lib/i18n-core';

export type Loaded = { name: string; pixels: Pixels; model: Model; note?: string };

/** Reads a skin PNG. Old 64×32 skins are converted to the current 64×64 layout. */
export async function decodeSkin(blob: Blob, name: string, model?: Model): Promise<Loaded> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error(t('That file isn’t an image this browser can open. Skins are .png files.'));
  }
  const { width: w, height: h } = bmp;
  if (w !== SKIN || (h !== SKIN && h !== 32)) {
    bmp.close();
    throw new Error(t('Skins are 64×64 pixels (or the old 64×32). This image is {w}×{h}.', { w, h }));
  }
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const data = ctx.getImageData(0, 0, w, h).data;
  const legacy = h === 32;
  const pixels = legacy ? upgradeLegacy(data) : new Uint8ClampedArray(data);
  return {
    name,
    pixels,
    model: model ?? (legacy ? 'classic' : guessModel(pixels)),
    note: legacy ? t('This was an old 64×32 skin. It now has its own left arm and leg (copied from the right ones), like the game does.') : undefined,
  };
}

export async function loadPlayer(query: string): Promise<Loaded> {
  let info;
  try {
    info = await lookupSkin(query);
  } catch (err) {
    throw err instanceof TypeError ? new Error(t('Could not reach the lookup service. Check your connection.')) : err;
  }
  if (!info) throw new Error(t('No Java account named “{v1}”.', { v1: query.trim() }));
  const res = await fetch(info.url).catch(() => null);
  if (!res?.ok) throw new Error(t('Found the player, but their skin file wouldn’t download. Try again in a moment.'));
  return decodeSkin(await res.blob(), info.name, info.slim ? 'slim' : 'classic');
}

export const fileBase = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'skin';

// Saved between visits: both slots and the recent colors. History starts fresh each visit.
export type Saved = {
  slots: ({ name: string; model: Model; pixels: Pixels } | null)[];
  active: number;
  recent: string[];
};

const store = createStore('unktilz-skin-editor', 'state');
export const loadSaved = () => get<Saved>('editor', store).catch(() => undefined);
export const save = (s: Saved) => set('editor', s, store).catch(() => {});
