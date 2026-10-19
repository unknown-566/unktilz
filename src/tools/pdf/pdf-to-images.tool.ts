import type { PDFDocumentProxy } from 'pdfjs-dist';
import { defineTool, type Opts, type RunEvent } from '../../registry/types';
import { parsePages } from '../../lib/pageRange';
import { baseName, canvasBlob, openPdf, renderPage } from '../../lib/pdfjs';

/** One page as the tool saves it; the preview uses the same. */
async function pagePicture(doc: PDFDocumentProxy, index: number, opts: Opts) {
  const { canvas } = await renderPage(doc, index, Number(opts.dpi) || 150);
  return canvasBlob(canvas, opts.format === 'jpg' ? 'image/jpeg' : 'image/png', Number(opts.quality) / 100);
}

export default defineTool({
  slug: 'pdf-to-images',
  name: 'PDF to images',
  category: 'pdf',
  order: 2,
  meta: '.pdf → .png / .jpg',
  added: '2026-10-15',
  beta: true,
  description: 'Turn PDF pages into PNG or JPG pictures, all of them or only the pages you pick. Several pages download as one .zip.',
  keywords: ['pdf to jpg', 'pdf to png', 'pdf to image', 'pdf page', 'screenshot', 'convert'],
  accepts: ['.pdf'],
  preview: async (file, opts) => {
    const doc = await openPdf(file);
    try {
      const pages = parsePages(String(opts.pages ?? ''), doc.numPages);
      return { blob: await pagePicture(doc, pages[0], opts), bytes: true, note: `page ${pages[0] + 1} of ${doc.numPages}` };
    } finally {
      void doc.destroy();
    }
  },
  options: [
    {
      key: 'format',
      label: 'Format',
      help: 'PNG is sharpest for text and drawings. JPG is much smaller for scans and photos.',
      type: 'choice',
      default: 'png',
      choices: [
        { value: 'png', label: 'png' },
        { value: 'jpg', label: 'jpg' },
      ],
    },
    {
      key: 'dpi',
      label: 'Resolution',
      hint: 'dpi',
      help: 'Dots per inch. 150 is good for the screen, 300 for printing or zooming in. Higher makes bigger files.',
      type: 'choice',
      default: '150',
      choices: [
        { value: '72', label: '72' },
        { value: '150', label: '150' },
        { value: '300', label: '300' },
      ],
    },
    { key: 'quality', label: 'Quality', help: 'Lower makes smaller JPG files with more blur.', type: 'range', min: 30, max: 100, step: 1, default: 88, unit: '%', when: (o) => o.format === 'jpg' },
    { key: 'pages', label: 'Pages', help: 'Empty takes every page. Otherwise e.g. 1-3, 5 or 7- (to the end).', type: 'text', default: '', placeholder: 'all', mono: true },
  ],
  run: ([file], opts, { signal }) =>
    (async function* (): AsyncGenerator<RunEvent> {
      const doc = await openPdf(file);
      try {
        const pages = parsePages(String(opts.pages ?? ''), doc.numPages);
        const jpg = opts.format === 'jpg';
        const digits = String(doc.numPages).length;
        for (let i = 0; i < pages.length; i++) {
          if (signal.aborted) return;
          const blob = await pagePicture(doc, pages[i], opts);
          const n = String(pages[i] + 1).padStart(digits, '0');
          yield { type: 'result', name: `${baseName(file.name)}-page-${n}.${jpg ? 'jpg' : 'png'}`, blob };
          yield { type: 'progress', value: (i + 1) / pages.length };
        }
      } finally {
        void doc.destroy();
      }
    })(),
});
