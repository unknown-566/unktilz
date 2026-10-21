import type { Output } from './blobs';
import { t } from '../lib/i18n-core';

/**
 * Jobs that a tool page makes from things it has in memory (the GIF maker's video frames,
 * stickers…), which can't be saved to IndexedDB like files. The queue keeps the work to do here,
 * runs it in turn with the other jobs, and stores the outputs as usual. They don't survive the page
 * being closed (see the store's rehydrate).
 */
export type TaskRun = (signal: AbortSignal, onProgress: (p: number) => void) => Promise<Output[]>;

type Task = { run: TaskRun; release?: () => void };

const tasks = new Map<string, Task>();

export const putTask = (id: string, run: TaskRun, release?: () => void) => void tasks.set(id, { run, release });

export const getTask = (id: string) => tasks.get(id);

/** Forgets a task (finished, failed or removed) and lets its tool free what it held for it. */
export function dropTask(id: string) {
  const t = tasks.get(id);
  tasks.delete(id);
  t?.release?.();
}

export const TASK_GONE = t('The page was closed while this was being made. Make it again.');
