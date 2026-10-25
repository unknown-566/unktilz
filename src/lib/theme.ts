import { useSyncExternalStore } from 'react';
import { t } from './i18n-core';

/** The site's color themes; their colors are in styles.css under [data-theme='…']. */
export const THEME_IDS = ['dark', 'light', 'midnight', 'terminal', 'paper', 'purple', 'polar', 'contrast'] as const;
export type Theme = (typeof THEME_IDS)[number];
/** What the person picked: a theme, or "follow the system" (dark or light). */
export type ThemeChoice = Theme | 'system';

export const themeName = (id: ThemeChoice): string =>
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
const listeners = new Set<() => void>();
// Kept in a constant: a media query nobody holds on to can be dropped together with its listener.
const osLight = window.matchMedia?.('(prefers-color-scheme: light)');
const lightOs = () => osLight?.matches ?? false;
const isTheme = (v: unknown): v is Theme => THEME_IDS.includes(v as Theme);

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

let choice: ThemeChoice = stored();
const resolve = (c: ThemeChoice): Theme => (c === 'system' ? (lightOs() ? 'light' : 'dark') : c);

function apply() {
  document.documentElement.dataset.theme = resolve(choice);
  listeners.forEach((l) => l());
}

export function setTheme(c: ThemeChoice) {
  choice = c;
  try {
    if (c === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked: the theme still applies for this visit */
  }
  apply();
}

// "Follow system" follows the system switching while the page is open, too.
osLight?.addEventListener?.('change', () => choice === 'system' && apply());

const snapshot = () => `${resolve(choice)}|${choice}`;

/** The theme in use (for colors read from CSS) and what was picked. */
export function useTheme(): [Theme, ThemeChoice] {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => 'dark|system',
  );
  const [theme, picked] = s.split('|');
  return [theme as Theme, picked as ThemeChoice];
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
