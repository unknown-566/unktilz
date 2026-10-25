import { useEffect, useState } from 'react';
import { decodeImage, encodePng, multiplyImg } from '../../../lib/mc/pack/pixels';

/**
 * Picture URLs for PNG bytes. The game's textures keep theirs for as long as the page is open (a few
 * thousand tiny blobs); a changed texture gets new bytes and so a new URL.
 */
const urls = new WeakMap<Uint8Array, string>();
export function pngUrl(bytes: Uint8Array): string {
  let u = urls.get(bytes);
  if (!u) {
    u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
    urls.set(bytes, u);
  }
  return u;
}

const tinted = new WeakMap<Uint8Array, Map<string, Promise<string>>>();

/** The texture colored like the game does (grass, leaves, water), as a picture URL. */
function tintedUrl(bytes: Uint8Array, tint: string): Promise<string> {
  let byColor = tinted.get(bytes);
  if (!byColor) tinted.set(bytes, (byColor = new Map()));
  let p = byColor.get(tint);
  if (!p) {
    p = decodeImage(bytes).then((img) => pngUrl(encodePng(multiplyImg(img, tint))));
    byColor.set(tint, p);
  }
  return p;
}

/** A texture's picture URL, colored when the game colors it. */
export function useTextureUrl(bytes: Uint8Array | undefined, tint?: string): string | undefined {
  const plain = bytes ? pngUrl(bytes) : undefined;
  const [colored, setColored] = useState<{ key: Uint8Array; url: string } | null>(null);
  useEffect(() => {
    if (!bytes || !tint) return;
    let alive = true;
    tintedUrl(bytes, tint).then((url) => alive && setColored({ key: bytes, url }), () => {});
    return () => {
      alive = false;
    };
  }, [bytes, tint]);
  if (!bytes) return undefined;
  return tint && colored?.key === bytes ? colored.url : plain;
}
