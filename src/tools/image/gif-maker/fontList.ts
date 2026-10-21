import gfData from '../../../lib/google-fonts.json';
import { t } from '../../../lib/i18n-core';

/**
 * Every font the GIF maker's texts can use: a few that come with the computer, ten that come with
 * the site (they work offline) and the rest of Google Fonts, loaded when picked (see fontLoad.ts).
 * A text layer keeps just the font's family name; the drawing code asks fontCss() and fontWeight()
 * how to write it.
 */

export type FontCat = 'sans' | 'serif' | 'display' | 'hand' | 'mono';
export type FontSource = 'system' | 'offline' | 'google';
export type FontInfo = {
  family: string;
  cat: FontCat;
  source: FontSource;
  /** Upright weights the font really has; empty for system fonts (whatever the computer has). */
  weights: number[];
  /** Has the letters with accents Czech (and other Central European languages) need. */
  czech: boolean;
};

export const FONT_CATS: { value: FontCat; label: string }[] = [
  { value: 'display', label: t('Display') },
  { value: 'sans', label: t('Sans') },
  { value: 'serif', label: t('Serif') },
  { value: 'hand', label: t('Handwriting') },
  { value: 'mono', label: t('Mono') },
];

/** System fonts with the CSS that writes them (and what to use where one is missing). */
const SYSTEM_CSS: Record<string, string> = {
  Impact: 'Impact, "Arial Black", sans-serif',
  'Arial Black': '"Arial Black", Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  'Comic Sans': '"Comic Sans MS", "Comic Sans", cursive',
  Georgia: 'Georgia, serif',
  Courier: '"Courier New", monospace',
};
const SYSTEM: FontInfo[] = [
  { family: 'Impact', cat: 'display' },
  { family: 'Arial Black', cat: 'sans' },
  { family: 'Arial', cat: 'sans' },
  { family: 'Comic Sans', cat: 'hand' },
  { family: 'Georgia', cat: 'serif' },
  { family: 'Courier', cat: 'mono' },
].map((f) => ({ ...f, cat: f.cat as FontCat, source: 'system', weights: [], czech: true }));

/** The fonts that come with the site (files from the @fontsource packages, see fontLoad.ts). */
export const OFFLINE: FontInfo[] = [
  { family: 'Anton', cat: 'display', weights: [400] },
  { family: 'Bebas Neue', cat: 'display', weights: [400] },
  { family: 'Bangers', cat: 'display', weights: [400] },
  { family: 'Luckiest Guy', cat: 'display', weights: [400] },
  { family: 'Montserrat', cat: 'sans', weights: [700, 900] },
  { family: 'Lobster', cat: 'display', weights: [400] },
  { family: 'Pacifico', cat: 'hand', weights: [400] },
  { family: 'Caveat', cat: 'hand', weights: [700] },
  { family: 'Permanent Marker', cat: 'hand', weights: [400], czech: false },
  { family: 'Press Start 2P', cat: 'display', weights: [400] },
].map((f) => ({ czech: true, ...f, cat: f.cat as FontCat, source: 'offline' }));

const GF_CATS: FontCat[] = ['sans', 'serif', 'display', 'hand', 'mono'];
const own = new Set([...SYSTEM, ...OFFLINE].map((f) => f.family));
const GOOGLE: FontInfo[] = (gfData as unknown as { fonts: [string, number, string, number][] }).fonts
  .filter(([family]) => !own.has(family))
  .map(([family, cat, weights, czech]) => ({
    family,
    cat: GF_CATS[cat] ?? 'sans',
    source: 'google',
    weights: [...weights].map((d) => Number(d) * 100),
    czech: czech === 1,
  }));

/** Offline ones first, then the computer's, then Google's most used first. */
export const FONT_LIST: FontInfo[] = [...OFFLINE, ...SYSTEM, ...GOOGLE];
const BY_FAMILY = new Map(FONT_LIST.map((f) => [f.family, f]));
export const fontInfo = (family: string) => BY_FAMILY.get(family);

export const DEFAULT_FONT = 'Impact';

const FALLBACK: Record<FontCat, string> = {
  sans: 'Arial, sans-serif',
  serif: 'Georgia, serif',
  display: 'Impact, "Arial Black", sans-serif',
  hand: '"Comic Sans MS", cursive',
  mono: '"Courier New", monospace',
};

/** CSS font-family for a font, with something similar for while it loads (or can't). */
export function fontCss(family: string) {
  if (SYSTEM_CSS[family]) return SYSTEM_CSS[family];
  // Saved by a version that kept CSS itself.
  if (family.includes(',')) return family;
  const info = BY_FAMILY.get(family);
  return `"${family.replace(/["\\]/g, '')}", ${FALLBACK[info?.cat ?? 'sans']}`;
}

/**
 * The weight to write with: the one asked for if the font has it, otherwise the nearest one it has
 * (heavier on a tie). One-weight fonts like Bangers would otherwise be thickened artificially.
 */
export function fontWeight(family: string, wanted: number) {
  const weights = BY_FAMILY.get(family)?.weights;
  if (!weights?.length) return wanted;
  let best = weights[0];
  for (const w of weights) {
    const d = Math.abs(w - wanted);
    const bd = Math.abs(best - wanted);
    if (d < bd || (d === bd && w > best)) best = w;
  }
  return best;
}

/** The weights a text in this font is drawn with (normal texts 700, subtitles 600). */
export const drawWeights = (family: string) => [...new Set([fontWeight(family, 700), fontWeight(family, 600)])].sort((a, b) => a - b);

/** Fonts saved by an older version as CSS ("Impact, "Arial Black", sans-serif") → family name. */
export function fixFont(font: unknown): string {
  if (typeof font !== 'string' || !font.trim()) return DEFAULT_FONT;
  if (!font.includes(',')) return font;
  for (const [family, css] of Object.entries(SYSTEM_CSS)) if (css === font) return family;
  const first = font.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return first || DEFAULT_FONT;
}

export type FontFaceSource = { url: string; weight: number; unicodeRange?: string };

/** The faces in a stylesheet from Google Fonts' CSS API: file, weight and the letters each covers. */
export function parseFontCss(css: string): FontFaceSource[] {
  const out: FontFaceSource[] = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const url = body.match(/src:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1];
    if (!url) continue;
    const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1] ?? 400);
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    out.push({ url, weight, ...(range ? { unicodeRange: range } : {}) });
  }
  return out;
}

/** Google Fonts CSS API address for a font in some weights (and optionally only some letters). */
export function googleCssUrl(family: string, weights: number[], text?: string) {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const ws = [...new Set(weights)].sort((a, b) => a - b);
  const spec = ws.length && !(ws.length === 1 && ws[0] === 400) ? `${name}:wght@${ws.join(';')}` : name;
  return `https://fonts.googleapis.com/css2?family=${spec}&display=block${text ? `&text=${encodeURIComponent(text)}` : ''}`;
}
