import { useSyncExternalStore } from 'react';
import { t } from './i18n-core';

/** The site's color themes; their colors are in styles.css under [data-theme='…']. */
export const THEME_IDS = ['dark', 'light', 'midnight', 'terminal', 'paper', 'purple', 'polar', 'contrast'] as const;
export type Theme = (typeof THEME_IDS)[number];
/** What the person picked: a theme, "follow the system" (dark or light), or one of their own themes. */
export type ThemeChoice = Theme | 'system' | `custom:${string}`;

/** The colors a theme sets (the same list in index.html). */
export const THEME_VARS = [
  '--bg', '--surface', '--line', '--fg', '--muted', '--accent', '--accent-text', '--on-accent', '--chip-line',
  '--grid', '--grid-major', '--rail-shadow', '--danger', '--warn', '--on-warn', '--info',
] as const;
export type ThemeVar = (typeof THEME_VARS)[number];

/** A theme the person made: all its colors, and whether it's dark or light (for the browser's own parts). */
export type CustomTheme = {
  id: string;
  name: string;
  base: 'dark' | 'light';
  vars: Record<ThemeVar, string>;
  /** Colors set by hand, which stay when a main color changes (the rest is worked out from the main ones). */
  fixed?: ThemeVar[];
};
export const MAX_CUSTOM = 20;

export const themeName = (id: Theme | 'system'): string =>
  ({
    system: t('Follow system'),
    dark: t('theme|Dark'),
    light: t('theme|Light'),
    midnight: t('Midnight'),
    terminal: t('Terminal'),
    paper: t('Paper'),
    purple: t('Purple night'),
    polar: t('Polar'),
    contrast: t('High contrast'),
  })[id];

const KEY = 'unktilz-theme';
const CUSTOM_KEY = 'unktilz-custom-themes';
const FONT_KEY = 'unktilz-font';
const SIZE_KEY = 'unktilz-text-size';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
// Kept in a constant: a media query nobody holds on to can be dropped together with its listener.
const osLight = window.matchMedia?.('(prefers-color-scheme: light)');
const lightOs = () => osLight?.matches ?? false;
const isTheme = (v: unknown): v is Theme => THEME_IDS.includes(v as Theme);

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: it still applies for this visit */
  }
};

// ---- own themes ----

/** A color value a theme may hold: hex, rgb()/rgba(), or a shadow made of those (nothing that could load anything). */
const SAFE = /^[#\w\s().,%-]{1,120}$/;

export function cleanTheme(v: unknown): CustomTheme | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<CustomTheme>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !o.vars || typeof o.vars !== 'object') return null;
  const vars = {} as Record<ThemeVar, string>;
  for (const k of THEME_VARS) {
    const val = (o.vars as Record<string, unknown>)[k];
    if (typeof val !== 'string' || !SAFE.test(val) || /url|expression/i.test(val)) return null;
    vars[k] = val;
  }
  const fixed = Array.isArray(o.fixed) ? THEME_VARS.filter((k) => o.fixed!.includes(k)) : [];
  return { id: o.id.slice(0, 40), name: o.name.slice(0, 40) || '?', base: o.base === 'light' ? 'light' : 'dark', vars, fixed };
}

function storedCustoms(): CustomTheme[] {
  try {
    const list = JSON.parse(read(CUSTOM_KEY) ?? '[]');
    return Array.isArray(list) ? list.map(cleanTheme).filter((x): x is CustomTheme => !!x).slice(0, MAX_CUSTOM) : [];
  } catch {
    return [];
  }
}

let customs = storedCustoms();
/** Goes up on every change of an own theme, so 3D views read the colors again. */
let rev = 0;

const customOf = (c: ThemeChoice) => (c.startsWith('custom:') ? customs.find((x) => `custom:${x.id}` === c) : undefined);

function stored(): ThemeChoice {
  const v = read(KEY);
  if (isTheme(v)) return v;
  if (v?.startsWith('custom:') && customOf(v as ThemeChoice)) return v as ThemeChoice;
  return 'system';
}

let choice: ThemeChoice = stored();
const resolve = (c: ThemeChoice): Theme => {
  if (c === 'system') return lightOs() ? 'light' : 'dark';
  if (isTheme(c)) return c;
  return customOf(c)?.base ?? (lightOs() ? 'light' : 'dark');
};

function apply() {
  const html = document.documentElement;
  html.dataset.theme = resolve(choice);
  const own = customOf(choice);
  for (const k of THEME_VARS) {
    if (own) html.style.setProperty(k, own.vars[k]);
    else html.style.removeProperty(k);
  }
  notify();
}

export function setTheme(c: ThemeChoice) {
  choice = c;
  write(KEY, c === 'system' ? null : c);
  apply();
}

function saveCustoms(next: CustomTheme[]) {
  customs = next;
  rev++;
  write(CUSTOM_KEY, next.length ? JSON.stringify(next) : null);
  apply();
}

/** Adds the theme, or replaces the one with its id. */
export function saveCustomTheme(theme: CustomTheme) {
  const i = customs.findIndex((x) => x.id === theme.id);
  saveCustoms(i < 0 ? [...customs, theme].slice(0, MAX_CUSTOM) : customs.map((x) => (x.id === theme.id ? theme : x)));
}

export function deleteCustomTheme(id: string) {
  if (choice === `custom:${id}`) {
    choice = 'system';
    write(KEY, null);
  }
  saveCustoms(customs.filter((x) => x.id !== id));
}

export const getCustomThemes = () => customs;
export const useCustomThemes = () => useSyncExternalStore(subscribe, getCustomThemes, getCustomThemes);
export const newThemeId = () => Math.random().toString(36).slice(2, 10);

const CODE = 'unktilz-theme:';
/** A theme as text to share: "unktilz-theme:" and its name and colors as base64 JSON. */
export function themeCode(theme: CustomTheme) {
  const json = JSON.stringify({ name: theme.name, base: theme.base, vars: theme.vars, fixed: theme.fixed });
  return CODE + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}
/** The theme in a shared code (with a new id), or null. */
export function parseThemeCode(text: string): CustomTheme | null {
  const s = text.trim();
  if (!s.startsWith(CODE)) return null;
  try {
    const bytes = Uint8Array.from(atob(s.slice(CODE.length).trim()), (ch) => ch.charCodeAt(0));
    return cleanTheme({ ...JSON.parse(new TextDecoder().decode(bytes)), id: newThemeId() });
  } catch {
    return null;
  }
}

// ---- font and size ----

export const FONT_IDS = ['theme', 'geist', 'system', 'mono', 'serif'] as const;
export type FontId = (typeof FONT_IDS)[number];
/** What --sans becomes for each font (the same list in index.html); "theme" leaves it to the theme. */
export const FONT_STACKS: Record<Exclude<FontId, 'theme'>, string> = {
  geist: "'Geist Variable', 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: 'var(--mono)',
  serif: "Georgia, 'Times New Roman', serif",
};
export const TEXT_SIZES = [90, 100, 110, 125] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const isFont = (v: unknown): v is FontId => FONT_IDS.includes(v as FontId);
let font: FontId = ((v) => (isFont(v) ? v : 'theme'))(read(FONT_KEY));
let size: TextSize = ((v) => (TEXT_SIZES.includes(v as TextSize) ? (v as TextSize) : 100))(Number(read(SIZE_KEY)));

function applyLook() {
  const html = document.documentElement;
  if (font === 'theme') html.style.removeProperty('--sans');
  else html.style.setProperty('--sans', FONT_STACKS[font]);
  // Every font size in styles.css is multiplied by this; boxes and pictures keep their size.
  if (size === 100) html.style.removeProperty('--text-scale');
  else html.style.setProperty('--text-scale', String(size / 100));
  notify();
}

export function setFont(f: FontId) {
  font = f;
  write(FONT_KEY, f === 'theme' ? null : f);
  applyLook();
}
export function setTextSize(s: TextSize) {
  size = s;
  write(SIZE_KEY, s === 100 ? null : String(s));
  applyLook();
}

// ---- hooks ----

// "Follow system" follows the system switching while the page is open, too.
osLight?.addEventListener?.('change', () => choice === 'system' && apply());

const snapshot = () => `${customOf(choice) ? `custom-${rev}` : resolve(choice)}|${choice}|${font}|${size}`;

/** The theme in use (changes whenever its colors do, for colors read from CSS) and what was picked. */
export function useTheme(): [string, ThemeChoice] {
  const s = useSyncExternalStore(subscribe, snapshot, () => 'dark|system|theme|100');
  const [theme, picked] = s.split('|');
  return [theme, picked as ThemeChoice];
}

/** The font and text size picked. */
export function useLook(): { font: FontId; size: TextSize } {
  const s = useSyncExternalStore(subscribe, snapshot, () => 'dark|system|theme|100');
  const [, , f, z] = s.split('|');
  return { font: f as FontId, size: Number(z) as TextSize };
}

// The colors, font and size are already set by index.html before the page draws; this keeps them in step.
apply();
applyLook();

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
