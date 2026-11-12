import { useSyncExternalStore } from 'react';

/** Whether a finished queue job downloads by itself: never, for every tool, or for the picked tools. */
export type AutoDownload = { mode: 'off' | 'all' | 'custom'; tools: string[] };

const KEY = 'unktilz-auto-download';
const OFF: AutoDownload = { mode: 'off', tools: [] };
const listeners = new Set<() => void>();

function stored(): AutoDownload {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AutoDownload> | null;
    if (!v || !['off', 'all', 'custom'].includes(v.mode as string)) return OFF;
    return { mode: v.mode!, tools: Array.isArray(v.tools) ? v.tools.filter((s) => typeof s === 'string') : [] };
  } catch {
    return OFF;
  }
}

let current = stored();

export const getAutoDownload = () => current;

export function setAutoDownload(next: AutoDownload) {
  current = next;
  try {
    if (next.mode === 'off' && !next.tools.length) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: it still works for this visit */
  }
  listeners.forEach((l) => l());
}

/** Should a job of this tool download as soon as it's done? */
export function wantsAutoDownload(slug: string) {
  return current.mode === 'all' || (current.mode === 'custom' && current.tools.includes(slug));
}

export function useAutoDownload(): AutoDownload {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getAutoDownload,
    () => OFF,
  );
}

// A change made in another tab of the site counts here too.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY && e.key !== null) return;
  current = stored();
  listeners.forEach((l) => l());
});
