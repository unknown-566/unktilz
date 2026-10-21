import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  TextRenderingMode,
  beginText,
  endText,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import fontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import type { Placed } from '../../tools/pdf/scan/layout';
import { t } from '../../lib/i18n-core';

/** A recognised word and its box in the page picture's pixels. */
export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };

// DejaVu Sans (free licence) has Czech, Slovak, Polish, German… letters, so the hidden text is
// exactly what was read. Only the letters used are put into the PDF.
let fontBytes: Promise<ArrayBuffer> | null = null;
const fonts = new WeakMap<PDFDocument, Promise<PDFFont>>();
function fontFor(doc: PDFDocument) {
  let f = fonts.get(doc);
  if (!f) {
    fontBytes ??= fetch(fontUrl).then((r) => {
      if (!r.ok) throw new Error(t('The font for the recognised text couldn\'t be loaded.'));
      return r.arrayBuffer();
    });
    doc.registerFontkit(fontkit);
    f = fontBytes.then((b) => doc.embedFont(b, { subset: true }));
    fonts.set(doc, f);
  }
  return f;
}

/**
 * Puts the recognised words on the page as invisible text (PDF text rendering mode 3, as scanners
 * do) right over where they are in the picture, each stretched to its word's width, so the scan can
 * be searched, selected and copied.
 */
export async function drawWords(doc: PDFDocument, page: PDFPage, words: OcrWord[], at: Placed, picWidth: number) {
  const font = await fontFor(doc);
  const key = page.node.newFontDictionary('OcrText', font.ref);
  const k = at.w / picWidth;
  for (const wd of words) {
    const text = wd.text.trim();
    if (!text) continue;
    const boxW = (wd.x1 - wd.x0) * k;
    const boxH = (wd.y1 - wd.y0) * k;
    if (boxW <= 0 || boxH <= 0) continue;
    let encoded;
    try {
      encoded = font.encodeText(`${text} `);
    } catch {
      continue;
    }
    const size = boxH;
    const natural = font.widthOfTextAtSize(text, size);
    if (!natural) continue;
    // Bottom of the box minus the part below the baseline (g, p, y…).
    const x = at.x + wd.x0 * k;
    const y = at.y + at.h - wd.y1 * k + boxH * 0.2;
    page.pushOperators(
      beginText(),
      setFontAndSize(key, size),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setCharacterSqueeze(Math.max(1, Math.min(1000, (boxW / natural) * 100))),
      setTextMatrix(1, 0, 0, 1, x, y),
      showText(encoded),
      endText(),
    );
  }
}
