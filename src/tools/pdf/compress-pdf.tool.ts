import type { PDFDocumentProxy } from 'pdfjs-dist';
import { defineTool, type Opts, type RunEvent } from '../../registry/types';
import { formatBytes } from '../../queue/download';
import { baseName, canvasBlob, openPdf, renderPage } from '../../lib/pdfjs';
import { computeValue } from '../../lib/compute';

/** Resolution and JPG quality per level. */
const LEVELS: Record<string, { dpi: number; quality: number }> = {
  strong: { dpi: 96, quality: 0.6 },
  balanced: { dpi: 144, quality: 0.72 },
  light: { dpi: 200, quality: 0.85 },
};

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
  name: 'Compress PDF',
  category: 'pdf',
  order: 4,
  meta: 'smaller .pdf',
  beta: true,
  description:
    'Make PDFs smaller by redrawing every page as a compressed picture. Works best on scans and photos. The text can’t be selected or searched afterwards, so keep the original if you need that.',
  keywords: ['compress pdf', 'shrink pdf', 'reduce pdf size', 'smaller pdf', 'email', 'upload limit', 'scan'],
  accepts: ['.pdf'],
  preview: async (file, opts) => {
    const doc = await openPdf(file);
    try {
      return { blob: (await compressPage(doc, 0, opts)).jpg, note: `page 1 of ${doc.numPages}` };
    } finally {
      void doc.destroy();
    }
  },
  options: [
    {
      key: 'level',
      label: 'Compression',
      help: 'Strong gives the smallest file; small print can get blurry. Light keeps pages sharp but saves less.',
      type: 'choice',
      default: 'balanced',
      choices: [
        { value: 'strong', label: 'strong' },
        { value: 'balanced', label: 'balanced' },
        { value: 'light', label: 'light' },
      ],
    },
    { key: 'gray', label: 'Black & white', help: 'Removes the color, which makes scans of text even smaller.', type: 'toggle', default: false },
  ],
  run: ([file], opts, { signal }) =>
    (async function* (): AsyncGenerator<RunEvent> {
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
            `This PDF is already small (${formatBytes(file.size)}; it's probably mostly text): compressing would make it bigger (${formatBytes(pdf.size)}).${opts.level === 'strong' ? '' : ' “Strong” might still help.'}`,
          );
        yield { type: 'result', name: `${baseName(file.name)}-compressed.pdf`, blob: pdf };
      } finally {
        void doc.destroy();
      }
    })(),
});
