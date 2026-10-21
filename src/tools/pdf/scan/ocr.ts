import type { OcrWord } from '../../../workers/tasks/ocrLayer';
import { t, tx } from '../../../lib/i18n-core';

/**
 * Text recognition for Images to PDF: Tesseract (tesseract.js, Apache-2.0) in its own worker. Its
 * program and the language files come with this site (no outside CDN) and load only when text
 * recognition is used; the browser keeps them after the first time.
 */

export type OcrLang = { code: string; name: string; mb: number };
/** The languages offered, with the size of their file. */
export const OCR_LANGS: OcrLang[] = [
  { code: 'eng', name: tx('English'), mb: 3 },
  { code: 'ces', name: tx('Czech'), mb: 2.2 },
  { code: 'slk', name: tx('Slovak'), mb: 2.4 },
  { code: 'deu', name: tx('German'), mb: 1.3 },
  { code: 'pol', name: tx('Polish'), mb: 2.6 },
  { code: 'spa', name: tx('Spanish'), mb: 2.1 },
  { code: 'fra', name: tx('French'), mb: 0.7 },
];
/** The recognition program itself. */
export const OCR_CORE_MB = 4.2;

/** Workers started from a blob can't follow site-relative paths. */
const absolute = (u: string) => new URL(u, location.href).href;

type Box = { x0: number; y0: number; x1: number; y1: number };
type TessWord = { text: string; confidence: number; bbox: Box };
type TessBlock = { paragraphs: { lines: { bbox: Box; words: TessWord[] }[] }[] };

export type OcrSession = { read: (picture: Blob) => Promise<OcrWord[]>; end: () => Promise<void> };

/** A recogniser for these languages; `onStatus` hears what it's loading. */
export async function startOcr(langs: string[], onStatus?: (text: string) => void): Promise<OcrSession> {
  const codes = langs.filter((c) => OCR_LANGS.some((l) => l.code === c));
  if (!codes.length) codes.push('eng');
  onStatus?.(t('Loading text recognition…'));
  const [{ createWorker, OEM }, worker, core] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url'),
    import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'),
  ]);
  // Tesseract reports some failures (a file that doesn't load…) only to this handler; without it the
  // job would wait forever.
  let fail: (e: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => (fail = reject));
  const broke = (e: unknown) => fail(new Error(t('Text recognition failed: {reason}', { reason: String(e).replace(/^(Error: )+/, '') })));
  const starting = createWorker(codes.join('+'), OEM.LSTM_ONLY, {
    workerPath: absolute(worker.default),
    corePath: absolute(core.default),
    // The language files, served by the site (see vite.config.ts).
    langPath: absolute('/ocr'),
    gzip: true,
    // The files come from this site and the browser caches them; no second copy in IndexedDB.
    cacheMethod: 'none',
    legacyCore: false,
    legacyLang: false,
    errorHandler: broke,
  });
  const tess = await Promise.race([starting, failed]).catch(async (e) => {
    void starting.then((tt) => tt.terminate()).catch(() => {});
    throw e;
  });
  return {
    read: async (picture) => {
      const r = await Promise.race([tess.recognize(picture, {}, { blocks: true }), failed]);
      const blocks = (r.data.blocks ?? []) as unknown as TessBlock[];
      const words: OcrWord[] = [];
      for (const b of blocks)
        for (const p of b.paragraphs)
          for (const l of p.lines)
            for (const w of l.words) {
              const text = w.text.trim();
              // Very unsure "words" are usually specks or lines, not text. A word takes its line's height,
              // so a line stays one line when copied (not split by tall and short letters).
              if (text && w.confidence >= 30) words.push({ text, x0: w.bbox.x0, x1: w.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 });
            }
      return words;
    },
    end: async () => {
      await tess.terminate();
    },
  };
}
