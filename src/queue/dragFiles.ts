// Finished results can be dragged from the queue into any tool that takes files (or out of the
// browser), and "Open in…" hands them to a tool directly. Results live in IndexedDB, and a drag
// can only carry text, so the drag carries the job's id and the drop reads the files back.
import { useEffect, type DragEvent } from 'react';
import { create } from 'zustand';
import { getOutputs } from './blobs';
import type { Job } from './store';
import { t } from '../lib/i18n-core';

const TYPE = 'application/x-unktilz-output';

type Dragged = { jobId: string; names: string[] };

/** What is being dragged from the queue right now (zones that take it light up). */
export const useDragged = create<{ dragged: Dragged | null }>(() => ({ dragged: null }));

// Blob URLs made ahead (on hover), because a drag out of the browser needs one at once.
const urls = new Map<string, string[]>();

/** Reads a finished job's results so dragging it out of the browser works on the first try. */
export async function prepareOutputs(job: Job): Promise<string[] | undefined> {
  if (job.status !== 'done') return undefined;
  if (urls.has(job.id)) return urls.get(job.id);
  const out = await getOutputs(job.id).catch(() => undefined);
  if (!out?.length) return undefined;
  if (!urls.has(job.id)) urls.set(job.id, out.map((o) => URL.createObjectURL(o.blob)));
  return urls.get(job.id);
}

const PICTURES = /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/;
/**
 * A job whose one result is a picture the browser shows. Its tile shows the picture, and dragging
 * the picture itself (an <img>) is what carries a real file to other apps like Discord; a
 * DownloadURL only works for folders.
 */
export const isPictureJob = (job: Job) => job.status === 'done' && job.outputs?.length === 1 && PICTURES.test(job.outputs[0].type);

/** Frees the prepared URLs of jobs that are gone. */
export function forgetOutputs(keep: string[]) {
  for (const [id, list] of urls) {
    if (keep.includes(id)) continue;
    list.forEach((u) => URL.revokeObjectURL(u));
    urls.delete(id);
  }
}

export function startOutputDrag(e: DragEvent, job: Job) {
  if (job.status !== 'done' || !job.outputs?.length) return;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(TYPE, job.id);
  const names = job.outputs.map((o) => o.name);
  // One file can also go out of the browser: to the desktop, a folder or a chat (Chrome, Edge).
  const ready = urls.get(job.id);
  // Dragging a picture (<img>) already carries the file itself; a DownloadURL would replace it.
  const fromPicture = (e.target as HTMLElement).tagName === 'IMG';
  if (job.outputs.length === 1 && ready?.[0] && !fromPicture) e.dataTransfer.setData('DownloadURL', `${job.outputs[0].type || 'application/octet-stream'}:${names[0]}:${ready[0]}`);
  useDragged.setState({ dragged: { jobId: job.id, names } });
}

export const endOutputDrag = () => useDragged.setState({ dragged: null });

/** Files from the computer, or a result from the queue. */
export const isFileDrag = (e: DragEvent) => {
  const types = [...e.dataTransfer.types];
  return types.includes('Files') || types.includes(TYPE);
};

/** The dropped files: from the computer as they are, results from the queue read back as files. */
export async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const jobId = e.dataTransfer.getData(TYPE);
  const local = [...e.dataTransfer.files];
  endOutputDrag();
  if (!jobId) return local;
  return jobFiles(jobId);
}

/** A finished job's results as files. */
export async function jobFiles(jobId: string): Promise<File[]> {
  const out = await getOutputs(jobId).catch(() => undefined);
  if (!out?.length) throw new Error(t('That result is no longer stored. Run the job again.'));
  return out.map((o) => new File([o.blob], o.name, { type: o.blob.type, lastModified: Date.now() }));
}

/** Whether a file name fits a list of extensions ('.png'…; '*' or an empty list take anything). */
export const fitsAccept = (name: string, accept: string[]) =>
  !accept.length || accept.includes('*') || accept.some((a) => (a.startsWith('.') ? name.toLowerCase().endsWith(a) : true));

// ---- "Open in…": files waiting for a tool's page to take them ----

type Pending = { slug: string; files: File[]; at: number };
const usePending = create<{ pending: Pending | null }>(() => ({ pending: null }));

export const sendToTool = (slug: string, files: File[]) => usePending.setState({ pending: { slug, files, at: Date.now() } });

/**
 * On a tool's page, takes the files "Open in…" sent to it (once, within a short time, so they don't
 * turn up later by surprise). Pass `null` as slug to opt out.
 */
export function usePendingFiles(slug: string | null | undefined, take: (files: File[]) => void) {
  const pending = usePending((s) => s.pending);
  useEffect(() => {
    if (!slug || !pending || pending.slug !== slug) return;
    usePending.setState({ pending: null });
    if (Date.now() - pending.at < 15_000) take(pending.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, slug]);
}

// ---- copying a picture (for apps that don't take drags from a web page, like the Discord app) ----

/**
 * Puts a finished picture on the clipboard, so Ctrl+V pastes it into any app. Clipboards take PNG,
 * so other pictures are turned into PNG first. Started right in the click (the PNG is a promise),
 * because browsers only allow writing the clipboard during one.
 */
export function copyPicture(job: Job): Promise<void> {
  const png = getOutputs(job.id).then(async (out) => {
    const blob = out?.[0]?.blob;
    if (!blob) throw new Error(t('That result is no longer stored. Run the job again.'));
    if (blob.type === 'image/png') return blob;
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    return c.convertToBlob({ type: 'image/png' });
  });
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error(t('This browser can’t copy pictures. Download it instead.')));
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).catch((e: Error) => {
    throw new Error(e.name === 'NotAllowedError' ? t('The browser didn’t allow copying. Click the button again.') : e.message);
  });
}
