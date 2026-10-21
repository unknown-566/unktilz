import type { PDFDocumentProxy } from 'pdfjs-dist';
import { t } from './i18n-core';

// pdf.js (Apache-2.0) draws PDF pages. It parses in its own worker and draws here, on a canvas,
// so it's loaded only when a PDF tool runs.
let lib: Promise<typeof import('pdfjs-dist')> | null = null;

function pdfjs() {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  });
  return lib;
}

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  try {
    return await m.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    if ((e as Error)?.name === 'PasswordException') throw new Error(t('{name} is password protected. Remove the password first.', { name: file.name }));
    throw new Error(t('{name} isn\'t a readable PDF.', { name: file.name }));
  }
}

/** Frees what pdf.js holds for a document (its worker's copy too). pdf.js 6 does this through the loading task. */
export const closePdf = (doc: PDFDocumentProxy | null | undefined) => (doc ? doc.loadingTask.destroy() : Promise.resolve());

/** Most pixels one page may have (a browser canvas fails above roughly this). */
const MAX_PIXELS = 60_000_000;

/** Draws page `index` (0-based) at `dpi` on a white background. */
export async function renderPage(doc: PDFDocumentProxy, index: number, dpi: number) {
  const page = await doc.getPage(index + 1);
  let scale = dpi / 72;
  const base = page.getViewport({ scale: 1 });
  const pixels = base.width * base.height * scale * scale;
  if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // "print" draws in one go; the default "display" waits for animation frames, which stop while
  // the tab is in the background, so a conversion would pause until you came back.
  await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
  page.cleanup();
  /** Page size in PDF points (1/72 inch), as it's shown (rotation applied). */
  return { canvas, width: base.width, height: base.height };
}

export const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('The page is too big to draw.')))), type, quality));

/** "file.pdf" → "file" */
export const baseName = (name: string) => name.replace(/\.[^./]+$/, '') || 'document';
