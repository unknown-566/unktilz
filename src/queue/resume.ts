import type { Resume } from './store';
import type { TaskRun } from './tasks';

/**
 * Tasks that can carry on after the page reloads (switching the language, F5, a closed tab).
 * A task saves `{ kind, data }` with its job; after a reload the runner asks here for the work
 * again. A download keeps running in yt-dlp meanwhile, so it only has to be followed again.
 * The tool's code loads only when such a job is there.
 */
type Resumer = (data: unknown, ...rest: Parameters<TaskRun>) => ReturnType<TaskRun>;

const RESUMERS: Record<string, () => Promise<Resumer>> = {
  downloader: () => import('../tools/video/downloader/task').then((m) => m.runDownload as Resumer),
};

export async function resumer(r: Resume): Promise<TaskRun | undefined> {
  const load = RESUMERS[r.kind];
  if (!load) return undefined;
  const fn = await load();
  return (signal, onProgress, keep) => fn(r.data, signal, onProgress, keep);
}
