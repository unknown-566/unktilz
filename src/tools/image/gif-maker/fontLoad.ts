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
import montserrat700Latin from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url';
import montserrat700Ext from '@fontsource/montserrat/files/montserrat-latin-ext-700-normal.woff2?url';
import montserrat900Latin from '@fontsource/montserrat/files/montserrat-latin-900-normal.woff2?url';
import montserrat900Ext from '@fontsource/montserrat/files/montserrat-latin-ext-900-normal.woff2?url';
import pacificoLatin from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?url';
import pacificoExt from '@fontsource/pacifico/files/pacifico-latin-ext-400-normal.woff2?url';
import markerLatin from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url';
import pressStartLatin from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url';
import pressStartExt from '@fontsource/press-start-2p/files/press-start-2p-latin-ext-400-normal.woff2?url';
import { drawWeights, fontInfo, googleCssUrl, parseFontCss, type FontFaceSource } from './fontList';

// The letters each file covers (the same split Google Fonts and Fontsource use).
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';

const pair = (weight: number, latin: string, ext?: string): FontFaceSource[] => [
  { url: latin, weight, unicodeRange: LATIN },
  ...(ext ? [{ url: ext, weight, unicodeRange: LATIN_EXT }] : []),
];

const OFFLINE_FILES: Record<string, FontFaceSource[]> = {
  Anton: pair(400, antonLatin, antonExt),
  'Bebas Neue': pair(400, bebasLatin, bebasExt),
  Bangers: pair(400, bangersLatin, bangersExt),
  'Luckiest Guy': pair(400, luckiestLatin, luckiestExt),
  Montserrat: [...pair(700, montserrat700Latin, montserrat700Ext), ...pair(900, montserrat900Latin, montserrat900Ext)],
  Lobster: pair(400, lobsterLatin, lobsterExt),
  Pacifico: pair(400, pacificoLatin, pacificoExt),
  Caveat: pair(700, caveatLatin, caveatExt),
  'Permanent Marker': pair(400, markerLatin),
  'Press Start 2P': pair(400, pressStartLatin, pressStartExt),
};

const NO_INTERNET = 'needs the internet';

async function googleFaces(family: string, weights: number[], text?: string) {
  if (!navigator.onLine) throw new Error(NO_INTERNET);
  let res: Response;
  try {
    res = await fetch(googleCssUrl(family, weights, text));
  } catch {
    throw new Error(NO_INTERNET);
  }
  if (!res.ok) throw new Error(`Google Fonts said HTTP ${res.status}`);
  const faces = parseFontCss(await res.text());
  if (!faces.length) throw new Error('Google Fonts sent no font');
  return faces;
}

/** Adds the faces under a name and waits for the ones that cover `sample` (ordinary letters, by default). */
async function register(name: string, faces: FontFaceSource[], sample = 'AaŽž') {
  const added = faces.map((f) => {
    const face = new FontFace(name, `url(${f.url}) format('woff2')`, { weight: String(f.weight), ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}) });
    document.fonts.add(face);
    return face;
  });
  // Only Latin (with accents) is waited for; other alphabets load by themselves when a text uses them.
  const weights = [...new Set(faces.map((f) => f.weight))];
  const loaded = (await Promise.all(weights.map((w) => document.fonts.load(`${w} 40px "${name}"`, sample)))).flat();
  if (!loaded.length && !added.some((f) => f.status === 'loaded')) throw new Error('the font file didn’t load');
}

const loading = new Map<string, Promise<void>>();

/**
 * Loads (once) a font the texts can be drawn with. System fonts are always there; offline ones come
 * from the site; Google ones from the internet. Rejects with a short reason.
 */
export function loadFont(family: string): Promise<void> {
  const info = fontInfo(family);
  if (!info || info.source === 'system') return Promise.resolve();
  let p = loading.get(family);
  if (!p) {
    p = (async () => {
      const faces = info.source === 'offline' ? OFFLINE_FILES[family] : await googleFaces(family, drawWeights(family));
      await register(family, faces);
    })();
    // A failed load can be tried again (e.g. once the internet is back).
    p.catch(() => loading.delete(family));
    loading.set(family, p);
  }
  return p;
}

/** Whether a font is ready to draw with right now. */
export const fontReady = (family: string) => {
  const info = fontInfo(family);
  return !info || info.source === 'system' || document.fonts.check(`${drawWeights(family)[0]} 40px "${family}"`, 'Aa');
};

/** The font-family a font's name in the picker is written with. */
export const previewName = (family: string) => `preview ${family}`;

const previews = new Map<string, Promise<void>>();
let running = 0;
const waiting: (() => void)[] = [];
const slot = () => (running < 6 ? (running++, Promise.resolve()) : new Promise<void>((r) => waiting.push(() => (running++, r()))));
const done = () => {
  running--;
  waiting.shift()?.();
};

/**
 * Loads just the letters of a font's own name, for the font picker (a few kB per font). Kept under
 * its own name so it never stands in for the whole font.
 */
export function loadPreviewFont(family: string): Promise<void> {
  const info = fontInfo(family);
  if (!info || info.source === 'system') return Promise.resolve();
  if (info.source === 'offline') return loadFont(family);
  let p = previews.get(family);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        const w = drawWeights(family)[0];
        const faces = await googleFaces(family, [w], family);
        // Google sends only the letters of the name here, so those are what to wait for.
        await register(previewName(family), faces, family);
      } finally {
        done();
      }
    })();
    p.catch(() => previews.delete(family));
    previews.set(family, p);
  }
  return p;
}
