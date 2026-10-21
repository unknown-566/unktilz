import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import geistExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url';
import antonLatin from '@fontsource/anton/files/anton-latin-400-normal.woff2?url';
import antonExt from '@fontsource/anton/files/anton-latin-ext-400-normal.woff2?url';
import bangersLatin from '@fontsource/bangers/files/bangers-latin-400-normal.woff2?url';
import bangersExt from '@fontsource/bangers/files/bangers-latin-ext-400-normal.woff2?url';
import bebasLatin from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';
import bebasExt from '@fontsource/bebas-neue/files/bebas-neue-latin-ext-400-normal.woff2?url';
import caveatLatin from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import caveatExt from '@fontsource/caveat/files/caveat-latin-ext-700-normal.woff2?url';
import lobsterLatin from '@fontsource/lobster/files/lobster-latin-400-normal.woff2?url';
import lobsterExt from '@fontsource/lobster/files/lobster-latin-ext-400-normal.woff2?url';
import luckiestLatin from '@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff2?url';
import luckiestExt from '@fontsource/luckiest-guy/files/luckiest-guy-latin-ext-400-normal.woff2?url';
import montserratLatin from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url';
import montserratExt from '@fontsource/montserrat/files/montserrat-latin-ext-700-normal.woff2?url';
import pacificoLatin from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?url';
import pacificoExt from '@fontsource/pacifico/files/pacifico-latin-ext-400-normal.woff2?url';
import markerLatin from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url';
import pressStartLatin from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url';
import pressStartExt from '@fontsource/press-start-2p/files/press-start-2p-latin-ext-400-normal.woff2?url';
import { FONT_WEIGHT } from './render';

/**
 * The caption fonts: the ones that come with the site (the same @fontsource files the GIF maker
 * uses). An SVG shown as a picture or saved can't reach the page's fonts, so the caption's font goes
 * inside it as @font-face with the file written in.
 */
const FILES: Record<string, string[]> = {
  Geist: [geistLatin, geistExt],
  Montserrat: [montserratLatin, montserratExt],
  'Bebas Neue': [bebasLatin, bebasExt],
  Anton: [antonLatin, antonExt],
  Bangers: [bangersLatin, bangersExt],
  'Luckiest Guy': [luckiestLatin, luckiestExt],
  Lobster: [lobsterLatin, lobsterExt],
  Pacifico: [pacificoLatin, pacificoExt],
  Caveat: [caveatLatin, caveatExt],
  'Press Start 2P': [pressStartLatin, pressStartExt],
  'Permanent Marker': [markerLatin],
};
export const QR_FONTS = Object.keys(FILES);

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C4, U+2C60-2C7F, U+A720-A7FF';

const dataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*/, 'data:font/woff2'));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
};

const cache = new Map<string, Promise<string>>();

/** The @font-face rules of a caption font, with its files written in. */
export function fontCss(family: string): Promise<string> {
  const files = FILES[family];
  if (!files) return Promise.resolve('');
  let p = cache.get(family);
  if (!p) {
    p = Promise.all(files.map(dataUrl)).then((urls) =>
      urls
        .map((u, i) => `@font-face{font-family:'${family}';font-weight:${FONT_WEIGHT[family] ?? 400};src:url(${u}) format('woff2');unicode-range:${i ? LATIN_EXT : LATIN}}`)
        .join(''),
    );
    p.catch(() => cache.delete(family));
    cache.set(family, p);
  }
  return p;
}
