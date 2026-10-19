/// <reference lib="webworker" />
import type { ImagePayload, PreviewPayload, PreviewResult } from './tasks/image';
import type { MapExportPayload, MapGridPayload, MapGridResult } from './tasks/mapArt';
import type { ImagesToPdfPayload, JpgsToPdfPayload, MergePdfPayload, OrganizePdfPayload, ScanPreviewPayload } from './tasks/pdf';

export type TaskOutput = { name: string; blob: Blob }[];
export type Report = (progress: number) => void;

type Tasks = {
  image: [ImagePayload, TaskOutput];
  'image-preview': [PreviewPayload, PreviewResult];
  'merge-pdf': [MergePdfPayload, TaskOutput];
  'images-to-pdf': [ImagesToPdfPayload, TaskOutput];
  'organize-pdf': [OrganizePdfPayload, TaskOutput];
  'jpgs-to-pdf': [JpgsToPdfPayload, Blob];
  'scan-preview': [ScanPreviewPayload, Blob];
  'map-grid': [MapGridPayload, MapGridResult];
  'map-export': [MapExportPayload, TaskOutput];
};
export type TaskName = keyof Tasks;
export type TaskPayload<T extends TaskName> = Tasks[T][0];
export type TaskResult<T extends TaskName> = Tasks[T][1];
/** Tasks whose result is a list of files, so the queue can run them. */
export type FileTaskName = { [K in TaskName]: Tasks[K][1] extends TaskOutput ? K : never }[TaskName];

type Handler = (payload: never, report: Report) => Promise<unknown>;

// Each task module loads only when a job needs it.
const tasks: Record<TaskName, () => Promise<Handler>> = {
  image: () => import('./tasks/image').then((m) => m.processImage as Handler),
  'image-preview': () => import('./tasks/image').then((m) => m.previewImage as Handler),
  'merge-pdf': () => import('./tasks/pdf').then((m) => m.mergePdf as Handler),
  'images-to-pdf': () => import('./tasks/pdf').then((m) => m.imagesToPdf as Handler),
  'organize-pdf': () => import('./tasks/pdf').then((m) => m.organizePdf as Handler),
  'jpgs-to-pdf': () => import('./tasks/pdf').then((m) => m.jpgsToPdf as Handler),
  'scan-preview': () => import('./tasks/pdf').then((m) => m.scanPreview as Handler),
  'map-grid': () => import('./tasks/mapArt').then((m) => m.mapGrid as Handler),
  'map-export': () => import('./tasks/mapArt').then((m) => m.mapExport as Handler),
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<{ id: number; task: TaskName; payload: never }>) => {
  const { id, task, payload } = e.data;
  let last = 0;
  const report: Report = (value) => {
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    ctx.postMessage({ id, type: 'progress', value });
  };
  try {
    const handler = await tasks[task]();
    const result = await handler(payload, report);
    ctx.postMessage({ id, type: 'done', result });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
