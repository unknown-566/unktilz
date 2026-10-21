import type { PDFDocumentProxy } from 'pdfjs-dist';
import { defineTool, type Opts, type RunEvent } from '../../registry/types';
import { formatBytes } from '../../queue/download';
import { baseName, canvasBlob, closePdf, openPdf, renderPage } from '../../lib/pdfjs';
import { compute, computeValue } from '../../lib/compute';
import type { CompressLevel } from '../../workers/tasks/pdfImages';
import { t } from '../../lib/i18n-core';

/** "Redraw pages": resolution and JPG quality per level. */
const LEVELS: Record<string, { dpi: number; quality: number }> = { strong: { dpi: 96, quality: 0.6 }, balanced: { dpi: 144, quality: 0.72 }, light: { dpi: 200, quality: 0.85 } };

const redraw = (o: Opts) => o.method === 'redraw';

/** One page redrawn as the compressed picture that goes into the new PDF; the preview uses the same. */
async function compressPage(doc: PDFDocumentProxy, index: number, opts: Opts) {
  const level = LEVELS[String(opts.level)] ?? LEVELS.balanced;
  const { canvas, width, height } = await renderPage(doc, index, level.dpi);
  if (opts.gray) {
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const jpg = await canvasBlob(canvas, 'image/jpeg', level.quality);
  canvas.width = canvas.height = 0;
  return { jpg, width, height };
}

export default defineTool({
  slug: 'compress-pdf',
  name: t('Compress PDF'),
  category: 'pdf',
  order: 4,
  meta: t('smaller .pdf'),
  beta: true,
  description:
    t('Make PDFs smaller. “Keep text” only shrinks the pictures inside, so text stays sharp and selectable. “Redraw pages” turns every page into a compressed picture: the smallest result for scans, but the text can’t be selected afterwards.'),
  keywords: ['compress pdf', 'shrink pdf', 'reduce pdf size', 'smaller pdf', 'email', 'upload limit', 'scan', 'optimize pdf'],
  accepts: ['.pdf'],
  preview: async (file, opts) => {
    const doc = await openPdf(file);
    try {
      if (!redraw(opts)) {
        // Text and drawings stay as they are; how much the pictures shrink shows in the result.
        const { canvas } = await renderPage(doc, 0, 110);
        return { blob: await canvasBlob(canvas, 'image/png'), note: t('page 1 of {numPages}: text stays as it is, pictures get smaller', { numPages: doc.numPages }) };
      }
      return { blob: (await compressPage(doc, 0, opts)).jpg, note: t('page 1 of {numPages}', { numPages: doc.numPages }) };
    } finally {
      void closePdf(doc);
    }
  },
  options: [
    {
      key: 'method',
      label: t('Method'),
      help: t('Keep text: only the pictures inside are made smaller; text and drawings stay sharp and can be selected and searched. Redraw pages: every page becomes a picture, the smallest file for scans, but the text can’t be selected afterwards.'),
      type: 'choice',
      default: 'keep',
      choices: [
        { value: 'keep', label: t('keep text') },
        { value: 'redraw', label: t('redraw pages') },
      ],
    },
    {
      key: 'level',
      label: t('Compression'),
      help: t('Strong gives the smallest file; small print or pictures can get blurry. Light keeps more detail but saves less.'),
      type: 'choice',
      default: 'balanced',
      choices: [
        { value: 'strong', label: t('strong') },
        { value: 'balanced', label: t('balanced') },
        { value: 'light', label: t('light') },
      ],
    },
    { key: 'gray', label: t('Black & white'), help: t('Removes the color (of the pictures, or of the whole pages when redrawing), which makes them even smaller.'), type: 'toggle', default: false },
  ],
  run: ([file], opts, { signal }) =>
    redraw(opts) ? redrawPdf(file, opts, signal) : compute('compress-pdf-images', { file, level: String(opts.level) as CompressLevel, gray: Boolean(opts.gray) }, signal),
});

/** "Redraw pages": every page drawn as a compressed picture. */
function redrawPdf(file: File, opts: Opts, signal: AbortSignal) {
  return (async function* (): AsyncGenerator<RunEvent> {
    const name = `${baseName(file.name)}-compressed.pdf`;
    const doc = await openPdf(file);
    try {
      // Pages are drawn here (pdf.js needs the page), then put together in the PDF worker, which
      // already has pdf-lib: the page doesn't load a second copy or freeze while it's assembled.
      const pages: { jpg: Blob; width: number; height: number }[] = [];
      for (let i = 0; i < doc.numPages; i++) {
        if (signal.aborted) return;
        pages.push(await compressPage(doc, i, opts));
        yield { type: 'progress', value: ((i + 1) / doc.numPages) * 0.9 };
      }
      const pdf = await computeValue('jpgs-to-pdf', { pages });
      if (signal.aborted) return;
      if (pdf.size >= file.size)
        throw new Error(
          t('This PDF is already small ({size}; it’s probably mostly text): compressing would make it bigger ({bigger}).', { size: formatBytes(file.size), bigger: formatBytes(pdf.size) }) +
            (opts.level === 'strong' ? '' : ` ${t('“Strong” might still help.')}`),
        );
      yield { type: 'result', name, blob: pdf };
    } finally {
      void closePdf(doc);
    }
  })();
}
