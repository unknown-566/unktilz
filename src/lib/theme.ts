import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'unktilz-theme';
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: theme still applies for this visit */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => 'dark' as Theme,
  );
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
