import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { Category, Opts, Tool } from '../registry';
import { controllers, dropAll, putInputs } from './blobs';
import { TASK_GONE, dropTask, putTask, type TaskRun } from './tasks';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type Job = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  file: string;
  status: JobStatus;
  /** 0..1 */
  progress: number;
  opts: Opts;
  error?: string;
  outputs?: { name: string; size: number; type: string }[];
  createdAt: number;
  /** Made by a tool page from what it has in memory (see tasks.ts), not from saved files. */
  task?: boolean;
};

/** What the queue shows for a task. */
export type TaskInfo = { slug: string; name: string; category: Category; file: string };

type QueueState = {
  jobs: Job[];
  hydrated: boolean;
  add: (tool: Tool, files: File[], opts: Opts) => void;
  /** Queues work a tool page does itself; `release` runs once it's over (done, failed or removed). Returns the job id. */
  addTask: (info: TaskInfo, run: TaskRun, release?: () => void) => string;
  remove: (id: string) => void;
  clearDone: () => void;
  patch: (id: string, patch: Partial<Job>) => void;
};

type Persisted = { jobs: Job[] };

const storage: PersistStorage<Persisted> = {
  getItem: async (name) => (await get(name).catch(() => null)) ?? null,
  setItem: (name, value) => set(name, value).catch(() => {}),
  removeItem: (name) => del(name).catch(() => {}),
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const fileLabel = (files: File[]) => (files.length === 1 ? files[0].name : `${files.length} files`);

export const useQueue = create<QueueState>()(
  persist(
    (setState, getState) => ({
      jobs: [],
      hydrated: false,

      add: (tool, files, opts) => {
        if (!files.length) return;
        const batches = tool.batch ? [files] : files.map((f) => [f]);
        const jobs: Job[] = batches.map((group) => ({
          id: newId(),
          slug: tool.slug,
          name: tool.name,
          category: tool.category,
          file: fileLabel(group),
          status: 'queued',
          progress: 0,
          opts: { ...opts },
          createdAt: Date.now(),
        }));
        jobs.forEach((job, i) => void putInputs(job.id, batches[i]));
        setState({ jobs: [...getState().jobs, ...jobs] });
      },

      addTask: (info, run, release) => {
        const id = newId();
        putTask(id, run, release);
        setState({ jobs: [...getState().jobs, { ...info, id, status: 'queued', progress: 0, opts: {}, createdAt: Date.now(), task: true }] });
        return id;
      },

      remove: (id) => {
        controllers.get(id)?.abort();
        // A running task is dropped by the runner when it stops; one still waiting goes now.
        if (!controllers.has(id)) dropTask(id);
        setState({ jobs: getState().jobs.filter((j) => j.id !== id) });
        void dropAll(id);
      },

      clearDone: () => {
        const gone = getState().jobs.filter((j) => j.status === 'done' || j.status === 'error');
        setState({ jobs: getState().jobs.filter((j) => !gone.includes(j)) });
        gone.forEach((j) => {
          dropTask(j.id);
          void dropAll(j.id);
        });
      },

      patch: (id, patch) => {
        setState({ jobs: getState().jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
      },
    }),
    {
      name: 'unktilz-queue',
      storage,
      partialize: (s) => ({ jobs: s.jobs }),
      // Jobs added before IndexedDB answered must not be overwritten by the stored list.
      merge: (persisted, current) => {
        const stored = (persisted as Persisted | undefined)?.jobs ?? [];
        const ids = new Set(stored.map((j) => j.id));
        return { ...current, jobs: [...stored, ...current.jobs.filter((j) => !ids.has(j.id))] };
      },
      onRehydrateStorage: () => () => {
        // A job that was running when the tab closed starts over; a task can't (what it was made
        // from was only in memory).
        useQueue.setState((s) => ({
          hydrated: true,
          jobs: s.jobs.map((j) =>
            j.task && (j.status === 'running' || j.status === 'queued')
              ? { ...j, status: 'error', error: TASK_GONE }
              : j.status === 'running'
                ? { ...j, status: 'queued', progress: 0 }
                : j,
          ),
        }));
      },
    },
  ),
);
