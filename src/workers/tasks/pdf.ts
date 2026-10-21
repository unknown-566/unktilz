import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';
import type { Report, TaskOutput } from '../compute.worker';
import { t } from '../../lib/i18n-core';

export type MergePdfPayload = { files: File[] };

export async function mergePdf(p: MergePdfPayload, report: Report): Promise<TaskOutput> {
  const out = await PDFDocument.create();
  for (let i = 0; i < p.files.length; i++) {
    const f = p.files[i];
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      throw new Error(t('{name} isn\'t a readable PDF.', { name: f.name }));
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
    report((i + 1) / (p.files.length + 1));
  }
  const bytes = await out.save();
  const first = p.files[0]?.name.replace(/\.pdf$/i, '') || 'merged';
  return [{ name: p.files.length > 1 ? `${first}-merged.pdf` : `${first}.pdf`, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }];
}

export type JpgsToPdfPayload = { pages: { jpg: Blob; width: number; height: number }[] };

/** Pages that are already JPGs (Compress PDF), each filling a page of its size. */
export async function jpgsToPdf(p: JpgsToPdfPayload, report: Report): Promise<Blob> {
  const out = await PDFDocument.create();
  for (let i = 0; i < p.pages.length; i++) {
    const { jpg, width, height } = p.pages[i];
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    out.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    report((i + 1) / p.pages.length);
  }
  return new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' });
}

/** One page of a PDF being made: a page of one of the source PDFs (turned clockwise by `rotate` on top of its own turn), or an empty page of a size in points. */
export type PageRef = { src: number; index: number; rotate: number } | { blank: [number, number] };
export type BuildPdfPayload = { sources: File[]; outputs: { name: string; pages: PageRef[] }[] };

/**
 * Makes PDFs out of pages of other PDFs (Organize and Split). Each output copies the pages it needs
 * from one source in a single go, so fonts and pictures the pages share are copied only once (a
 * page used twice still becomes two pages).
 */
export async function buildPdf(p: BuildPdfPayload, report: Report): Promise<TaskOutput> {
  const loaded: (PDFDocument | undefined)[] = [];
  const source = async (i: number) => {
    const ready = loaded[i];
    if (ready) return ready;
    const f = p.sources[i];
    if (!f) throw new Error(t('A page\'s PDF is missing.'));
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      throw new Error(t('{name} isn\'t a readable PDF.', { name: f.name }));
    }
    loaded[i] = doc;
    return doc;
  };
  const total = p.outputs.reduce((n, o) => n + o.pages.length, 0) || 1;
  let done = 0;
  const out: TaskOutput = [];
  for (const o of p.outputs) {
    if (!o.pages.length) continue;
    const doc = await PDFDocument.create();
    // The copies from each source, in the order they're used.
    const copies = new Map<number, PDFPage[]>();
    for (const src of new Set(o.pages.flatMap((pg) => ('src' in pg ? [pg.src] : [])))) {
      const from = await source(src);
      const indexes = o.pages.flatMap((pg) => ('src' in pg && pg.src === src ? [pg.index] : []));
      for (const i of indexes) if (i < 0 || i >= from.getPageCount()) throw new Error(t('Page {n} doesn\'t exist in {name}.', { n: i + 1, name: p.sources[src].name }));
      copies.set(src, await doc.copyPages(from, indexes));
    }
    const used = new Map<number, number>();
    for (const pg of o.pages) {
      if ('blank' in pg) doc.addPage(pg.blank);
      else {
        const n = used.get(pg.src) ?? 0;
        used.set(pg.src, n + 1);
        const page = doc.addPage(copies.get(pg.src)![n]);
        const turn = (((page.getRotation().angle + pg.rotate) % 360) + 360) % 360;
        if (turn !== page.getRotation().angle) page.setRotation(degrees(turn));
      }
      report(++done / total);
    }
    const bytes = await doc.save({ useObjectStreams: true });
    out.push({ name: o.name, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) });
  }
  if (!out.length) throw new Error(t('There are no pages to save.'));
  return out;
}
