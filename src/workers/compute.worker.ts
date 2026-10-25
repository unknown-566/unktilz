/// <reference lib="webworker" />
import type { ImagePayload, PreviewPayload, PreviewResult } from './tasks/image';
import type { CompressImagesPayload } from './tasks/pdfImages';
import type { MapExportPayload, MapGridPayload, MapGridResult } from './tasks/mapArt';
import type { BuildPdfPayload, JpgsToPdfPayload, MergePdfPayload } from './tasks/pdf';
import type { JarAssetsPayload, JarAssetsResult } from './tasks/mcJar';
import type { PanoramaPayload, PanoramaResult } from './tasks/mcPanorama';
import type { PagesToPdfPayload, PreparePagePayload, PreparedPage, ScanDetectPayload, ScanDetectResult } from './tasks/scanPdf';
import { applyLang, type Lang } from '../lib/i18n-core';

export type TaskOutput = { name: string; blob: Blob }[];
export type Report = (progress: number) => void;

type Tasks = {
  image: [ImagePayload, TaskOutput];
  'image-preview': [PreviewPayload, PreviewResult];
  'merge-pdf': [MergePdfPayload, TaskOutput];
  'build-pdf': [BuildPdfPayload, TaskOutput];
  'jpgs-to-pdf': [JpgsToPdfPayload, Blob];
  'compress-pdf-images': [CompressImagesPayload, TaskOutput];
  'scan-detect': [ScanDetectPayload, ScanDetectResult];
  'prepare-page': [PreparePagePayload, PreparedPage];
  'pages-to-pdf': [PagesToPdfPayload, TaskOutput];
  'map-grid': [MapGridPayload, MapGridResult];
  'map-export': [MapExportPayload, TaskOutput];
  'mc-jar-assets': [JarAssetsPayload, JarAssetsResult];
  'mc-panorama': [PanoramaPayload, PanoramaResult];
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
  'build-pdf': () => import('./tasks/pdf').then((m) => m.buildPdf as Handler),
  'jpgs-to-pdf': () => import('./tasks/pdf').then((m) => m.jpgsToPdf as Handler),
  'compress-pdf-images': () => import('./tasks/pdfImages').then((m) => m.compressPdfImages as Handler),
  'scan-detect': () => import('./tasks/scanPdf').then((m) => m.scanDetect as Handler),
  'prepare-page': () => import('./tasks/scanPdf').then((m) => m.preparePage as Handler),
  'pages-to-pdf': () => import('./tasks/scanPdf').then((m) => m.pagesToPdf as Handler),
  'map-grid': () => import('./tasks/mapArt').then((m) => m.mapGrid as Handler),
  'map-export': () => import('./tasks/mapArt').then((m) => m.mapExport as Handler),
  'mc-jar-assets': () => import('./tasks/mcJar').then((m) => m.jarAssets as Handler),
  'mc-panorama': () => import('./tasks/mcPanorama').then((m) => m.makePanorama as Handler),
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<{ id: number; task: TaskName; payload: never; lang: Lang }>) => {
  const { id, task, payload, lang } = e.data;
  let last = 0;
  const report: Report = (value) => {
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    ctx.postMessage({ id, type: 'progress', value });
  };
  try {
    // The page's language, so the messages of a failing task come in it.
    await applyLang(lang).catch(() => {});
    const handler = await tasks[task]();
    const result = await handler(payload, report);
    ctx.postMessage({ id, type: 'done', result });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
