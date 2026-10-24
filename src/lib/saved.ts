import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createStore, entries, get, set } from 'idb-keyval';
import { fmtDate, fmtTime, t } from './i18n-core';

/**
 * Things people keep, per tool, in IndexedDB (store "unktilz-saved"):
 * - `list:<slug>`: named saves, e.g. give-command items or favourite servers;
 * - `auto:<slug>`: the work in progress, restored when the tool is opened again.
 * Everything here also goes into the backup file (see src/pages/Backup.tsx).
 */
const store = createStore('unktilz-saved', 'items');

export type SavedItem<T = unknown> = { id: string; name: string; data: T; savedAt: number };

// ---- named saves ----

const cache = new Map<string, SavedItem[]>();
const listeners = new Map<string, Set<() => void>>();
const notify = (slug: string) => listeners.get(slug)?.forEach((fn) => fn());

async function load(slug: string) {
  if (!cache.has(slug)) {
    cache.set(slug, ((await get<SavedItem[]>(`list:${slug}`, store).catch(() => undefined)) ?? []).sort((a, b) => b.savedAt - a.savedAt));
    notify(slug);
  }
  return cache.get(slug)!;
}

async function write(slug: string, items: SavedItem[]) {
  const sorted = [...items].sort((a, b) => b.savedAt - a.savedAt);
  cache.set(slug, sorted);
  notify(slug);
  await set(`list:${slug}`, sorted, store);
}

const EMPTY: SavedItem[] = [];

/** The named saves of one tool, kept up to date across every component that uses them. */
export function useSaved<T>(slug: string) {
  useEffect(() => {
    load(slug);
  }, [slug]);
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!listeners.has(slug)) listeners.set(slug, new Set());
      listeners.get(slug)!.add(fn);
      return () => {
        listeners.get(slug)!.delete(fn);
      };
    },
    [slug],
  );
  const items = useSyncExternalStore(subscribe, () => cache.get(slug) ?? EMPTY) as SavedItem<T>[];

  return {
    items,
    /** Saves under a name; an existing item with that id (or, without id, that name) is replaced. */
    async save(name: string, data: T, id?: string) {
      const list = await load(slug);
      const same = list.find((i) => (id ? i.id === id : i.name === name));
      const item: SavedItem<T> = { id: same?.id ?? crypto.randomUUID(), name, data, savedAt: Date.now() };
      await write(slug, [item, ...list.filter((i) => i.id !== item.id)]);
      return item;
    },
    async rename(id: string, name: string) {
      const list = await load(slug);
      await write(
        slug,
        list.map((i) => (i.id === id ? { ...i, name } : i)),
      );
    },
    async remove(id: string) {
      const list = await load(slug);
      await write(
        slug,
        list.filter((i) => i.id !== id),
      );
    },
  };
}

/**
 * Saves under a name from outside a component (a queue task), replacing an item with that name,
 * and keeps only the newest `max`.
 */
export async function pushSaved<T>(slug: string, name: string, data: T, max = Infinity) {
  const list = await load(slug);
  const same = list.find((i) => i.name === name);
  const item: SavedItem<T> = { id: same?.id ?? crypto.randomUUID(), name, data, savedAt: Date.now() };
  await write(slug, [item, ...list.filter((i) => i.id !== item.id)].slice(0, max));
}

// ---- work in progress ----

/**
 * Keeps a tool's current state between visits: restores it once on mount, then saves it a moment
 * after every change. Nothing is saved before the restore has finished, so the defaults a tool
 * starts with never overwrite what was there.
 */
export function useAutosave<T>(slug: string, value: T, restore: (v: T) => void, fallback?: () => T | undefined) {
  const [ready, setReady] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    let alive = true;
    get<T>(`auto:${slug}`, store)
      .catch(() => undefined)
      .then((v) => {
        if (!alive) return;
        const found = v ?? fallback?.();
        if (found !== undefined) restoreRef.current(found);
        setReady(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => set(`auto:${slug}`, value, store).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [ready, slug, value]);
  return ready;
}

// ---- backup ----

/** Everything in the store, for the backup file. */
export const allSaved = () => entries<string, unknown>(store);

/**
 * Adds a backup's entries without losing anything: named saves are merged by id (the newer copy
 * wins), work in progress is only filled in where there is none yet.
 */
export async function mergeSaved(backup: [string, unknown][]) {
  let added = 0;
  for (const [key, value] of backup) {
    if (key.startsWith('list:')) {
      const slug = key.slice(5);
      const mine = await load(slug);
      const byId = new Map(mine.map((i) => [i.id, i]));
      for (const item of value as SavedItem[]) {
        const have = byId.get(item.id);
        if (!have || have.savedAt < item.savedAt) {
          byId.set(item.id, item);
          added++;
        }
      }
      await write(slug, [...byId.values()]);
    } else if ((await get(key, store)) === undefined) {
      await set(key, value, store);
      added++;
    }
  }
  return added;
}

/** "today 14:02", "yesterday", or a date. */
export function savedWhen(at: number) {
  const d = new Date(at);
  const now = new Date();
  const time = fmtTime(d);
  if (d.toDateString() === now.toDateString()) return t('today {time}', { time });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('yesterday {time}', { time });
  return fmtDate(d);
}
