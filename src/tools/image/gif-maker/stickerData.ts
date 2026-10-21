import notoData from '../../../lib/noto-emoji.json';
import { stickerKey, type StickerAnim, type StickerRef } from './compose';
import { t } from '../../../lib/i18n-core';

// ---------- Google Noto animated emoji (artwork CC BY 4.0) ----------

export type NotoEmoji = { code: string; char: string; name: string; cat: number; also: string[] };

/** "1f642_200d_2195_fe0f" → the emoji itself. */
const toChar = (code: string) => code.split('_').map((h) => String.fromCodePoint(parseInt(h, 16))).join('');

export const NOTO_CATEGORIES = (notoData as { categories: string[] }).categories;
export const NOTO: NotoEmoji[] = (notoData as { emoji: (string | number)[][] }).emoji.map(([code, name, cat, ...also]) => ({
  code: String(code),
  char: toChar(String(code)),
  name: String(name),
  cat: Number(cat),
  also: also.map(String),
}));
export const NOTO_BY_CODE = new Map(NOTO.map((e) => [e.code, e]));
export const notoUrl = (code: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;

// ---------- my stickers ----------

/** A sticker someone added, kept as the file's bytes so it can be backed up. */
export type MySticker = { mime: string; bytes: Uint8Array; w: number; h: number; frames: number };

/** Biggest file accepted as a sticker. */
export const MAX_STICKER_BYTES = 8 * 1024 * 1024;

// ---------- decoding ----------

/** Stickers are kept at most this big (enough for a sticker over most of a 640 px GIF). */
const MAX_SIDE = 320;
const MAX_FRAMES = 240;

/**
 * Every frame of an image (animated WebP, GIF or APNG, or a still picture) with how long each one
 * shows, scaled to at most MAX_SIDE pixels.
 */
export async function decodeSticker(blob: Blob, type = blob.type): Promise<StickerAnim> {
  const canAnimate = typeof ImageDecoder !== 'undefined' && type && (await ImageDecoder.isTypeSupported(type).catch(() => false));
  if (canAnimate) {
    const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type });
    try {
      // Both: without tracks.ready the frame count isn't known yet (it reads as no track at all).
      await dec.tracks.ready;
      await dec.completed;
      const track = dec.tracks.selectedTrack;
      const count = Math.min(MAX_FRAMES, Math.max(1, track?.frameCount ?? 1));
      const frames: ImageBitmap[] = [];
      const ends: number[] = [];
      let at = 0;
      let size: { w: number; h: number } | null = null;
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        size ??= fit(image.displayWidth, image.displayHeight);
        frames.push(await createImageBitmap(image, { resizeWidth: size.w, resizeHeight: size.h, resizeQuality: 'high' }));
        // Frames without a time (or a silly 0) show for a tenth of a second, like browsers do.
        at += image.duration && image.duration > 10_000 ? image.duration / 1e6 : 0.1;
        ends.push(at);
        image.close();
      }
      return { frames, ends, w: size!.w, h: size!.h };
    } finally {
      dec.close();
    }
  }
  const bmp = await createImageBitmap(blob);
  const size = fit(bmp.width, bmp.height);
  const small = await createImageBitmap(bmp, { resizeWidth: size.w, resizeHeight: size.h, resizeQuality: 'high' });
  bmp.close();
  return { frames: [small], ends: [1], w: size.w, h: size.h };
}

function fit(w: number, h: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

const cache = new Map<string, Promise<StickerAnim>>();

/** Frees a sticker's frames (an animated emoji is about 10 MB of them); it loads again if needed. */
export function forgetSticker(key: string, anim?: StickerAnim) {
  const p = cache.get(key);
  cache.delete(key);
  if (anim) closeFrames(anim);
  p?.then(closeFrames).catch(() => {});
}

function closeFrames(a: StickerAnim) {
  for (const f of a.frames) if (f instanceof ImageBitmap) f.close();
}

/** Loads (once) the frames of a sticker; `mine` looks up a saved sticker by id. */
export function loadSticker(ref: StickerRef, mine: (id: string) => MySticker | undefined): Promise<StickerAnim> {
  const key = stickerKey(ref);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (ref.type === 'noto') {
        let res: Response;
        try {
          res = await fetch(notoUrl(ref.code));
        } catch {
          throw new Error(t('Animated emoji need the internet, and it looks like there isn’t any.'));
        }
        if (!res.ok) throw new Error(t('This emoji couldn’t be loaded (HTTP {status}).', { status: res.status }));
        return decodeSticker(await res.blob(), 'image/webp');
      }
      const s = mine(ref.id);
      if (!s) throw new Error(t('This sticker isn’t in “my stickers” any more.'));
      return decodeSticker(new Blob([s.bytes as BlobPart], { type: s.mime }), s.mime);
    })();
    // A failed load can be tried again later (e.g. once the internet is back).
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
