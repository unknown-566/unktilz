import { abortError } from '../../../lib/channel';
import type { DlInfo, DlOptions, Phase } from './args';

/**
 * Talks to the downloader in the site's own local server (scripts/downloader-server.ts). The header tells
 * the server the request comes from this site (other websites can't send it without permission).
 */
const HEADERS = { 'X-Unktilz': '1' };

export class NoServerError extends Error {
  constructor() {
    super('The downloader runs yt-dlp on your computer, so it only works when the site is started with start.bat.');
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/dl${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? HEADERS : { ...HEADERS, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NoServerError();
  }
  const type = res.headers.get('content-type') ?? '';
  // A static host answers with its index page (or nothing): no downloader there.
  if (!type.includes('application/json')) throw new NoServerError();
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `The downloader answered ${res.status}.`);
  return data as T;
}

export type Versions = { ytdlp: string | null; aria2c: string | null; ffmpeg: string | null };
export type InstallState = { running: boolean; step?: string; progress: number; error?: string; done?: boolean };
export type Status = { platform: string; versions: Versions; install: InstallState };
export type JobState = {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  phase: Phase;
  progress: number;
  done: number;
  total: number;
  speed: number;
  eta: number;
  part: number;
  parts: number;
  connections: number;
  error?: string;
  files: { name: string; size: number }[];
};

export const getStatus = (fresh = false) => call<Status>(`/status${fresh ? '?fresh' : ''}`);
export const install = () => call<{ install: InstallState }>('/install', {});
export const updateYtdlp = () => call<{ output: string; versions: Versions }>('/update', {});
export const getInfo = (url: string) => call<DlInfo>('/info', { url });
const startJob = (url: string, options: DlOptions, item?: number) => call<JobState>('/start', { url, options, item });
const getJob = (id: string) => call<JobState>(`/job/${id}`);
const cancelJob = (id: string) => call<JobState>(`/job/${id}/cancel`, {});
const forgetJob = (id: string) => call<{ ok: true }>(`/job/${id}/forget`, {});

// ---- what each download is doing right now (speed, connections…), for the tool page ----

export type Live = JobState & { title: string };
const live = new Map<string, Live>();
const listeners = new Set<() => void>();
let snapshot: Live[] = [];
const changed = () => {
  snapshot = [...live.values()];
  listeners.forEach((fn) => fn());
};
export const subscribeLive = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const liveDownloads = () => snapshot;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One download from start to the finished files, for a queue task: starts yt-dlp, follows it, then
 * fetches the files and lets the server delete its copy. Stopping the task stops yt-dlp and aria2c.
 */
export async function download(
  url: string,
  options: DlOptions,
  title: string,
  item: number | undefined,
  signal: AbortSignal,
  onProgress: (p: number) => void,
): Promise<{ name: string; blob: Blob }[]> {
  const job = await startJob(url, options, item);
  const key = job.id;
  const stop = () => void cancelJob(job.id).catch(() => {});
  signal.addEventListener('abort', stop, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw abortError();
      await sleep(700);
      const j = await getJob(job.id);
      live.set(key, { ...j, title });
      changed();
      onProgress(j.progress);
      if (j.status === 'error') throw new Error(j.error ?? 'The download failed.');
      if (j.status === 'cancelled') throw abortError();
      if (j.status === 'done') {
        const out: { name: string; blob: Blob }[] = [];
        for (let i = 0; i < j.files.length; i++) {
          const res = await fetch(`/api/dl/job/${job.id}/file/${i}`, { headers: HEADERS, signal });
          if (!res.ok) throw new Error(`Getting ${j.files[i].name} from the downloader failed.`);
          out.push({ name: j.files[i].name, blob: await res.blob() });
        }
        return out;
      }
    }
  } finally {
    signal.removeEventListener('abort', stop);
    live.delete(key);
    changed();
    void forgetJob(job.id).catch(() => {});
  }
}
