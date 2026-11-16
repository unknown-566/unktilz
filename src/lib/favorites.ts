import { useSyncExternalStore } from 'react';

// Pinned tools and the ones opened last, for the top of the home page. Kept in localStorage (so
// they are part of Backup, like every "unktilz-" key) and shared between open tabs.

const PINS = 'unktilz-pinned';
const RECENT = 'unktilz-recent';
const MAX_RECENT = 6;

const read = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

let state = { pins: read(PINS), recent: read(RECENT) };
const listeners = new Set<() => void>();

function set(next: typeof state) {
  state = next;
  try {
    localStorage.setItem(PINS, JSON.stringify(next.pins));
    localStorage.setItem(RECENT, JSON.stringify(next.recent));
  } catch {
    /* private mode: it still works until the page is closed */
  }
  listeners.forEach((f) => f());
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== PINS && e.key !== RECENT) return;
    state = { pins: read(PINS), recent: read(RECENT) };
    listeners.forEach((f) => f());
  });

export const togglePin = (slug: string) => set({ ...state, pins: state.pins.includes(slug) ? state.pins.filter((s) => s !== slug) : [...state.pins, slug] });

/** Called when a tool's page opens: it goes to the front of "recently used". */
export function markUsed(slug: string) {
  if (state.recent[0] === slug) return;
  set({ ...state, recent: [slug, ...state.recent.filter((s) => s !== slug)].slice(0, MAX_RECENT) });
}

export const clearRecent = () => set({ ...state, recent: [] });

export function useFavorites() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
