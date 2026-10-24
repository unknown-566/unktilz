import { pushSaved } from '../../../lib/saved';
import { download, type DlJob } from './api';
import type { DlOptions } from './args';

/** One entry of the download history (the last 50 downloads). */
export type HistoryItem = { url: string; title: string; size: number; mode: DlOptions['mode'] };
export const HISTORY = 'downloader-history';

/** What the queue keeps for a download (see src/queue/resume.ts); `link` is what the history opens. */
export type DlTask = DlJob & { link: string };

/**
 * A download as a queue task. Its data is saved with the job, and the server's job id is added
 * once yt-dlp runs, so after a reload the queue follows the same download instead of losing it.
 */
export async function runDownload(data: unknown, signal: AbortSignal, onProgress: (p: number) => void, keep: (data: unknown) => void) {
  const d = data as DlTask;
  const files = await download(d, signal, onProgress, (serverId) => keep({ ...d, serverId }));
  const size = files.reduce((n, f) => n + f.blob.size, 0);
  await pushSaved<HistoryItem>(HISTORY, d.title, { url: d.link, title: d.title, size, mode: d.options.mode }, 50).catch(() => {});
  return files;
}
