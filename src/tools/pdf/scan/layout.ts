/**
 * Where a page's picture goes on the PDF page (Images to PDF), in points (1/72 inch) from the page's
 * bottom-left like PDF draws. Used by the PDF worker and by the page preview, so they agree.
 */

export type PageSize = 'a4' | 'letter' | 'fit';
/**
 * whole: the picture (a straightened sheet or a photo) fills the space inside the margins.
 * content: the picture is what was on the sheet (`box`, cut out of a sheet `sheetW` × `sheetH`): it
 * keeps its size and place as on the paper (paper width = page width), moved or shrunk only to stay
 * inside the margins.
 */
export type Layout = 'whole' | 'content';

export type Placed = { pageW: number; pageH: number; x: number; y: number; w: number; h: number };
/** The picture: its size in pixels; for "content", where it was on its sheet. */
export type PagePicture = { w: number; h: number; sheet?: { w: number; h: number; x: number; y: number } };

export const PAPER: Record<Exclude<PageSize, 'fit'>, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
export const mm = (v: number) => (v * 72) / 25.4;
/** Pixels per inch a scanned page is taken to have (so a sheet comes out page-sized with "fit"). */
export const SCAN_DPI = 300;

export function place(pic: PagePicture, size: PageSize, margin: number, layout: Layout, dpi = SCAN_DPI): Placed {
  const m = Math.max(0, margin);
  const sheet = layout === 'content' ? pic.sheet : undefined;
  if (size === 'fit') {
    // The page is the picture at `dpi`, plus the margins.
    const k = 72 / dpi;
    const w = pic.w * k;
    const h = pic.h * k;
    return { pageW: w + 2 * m, pageH: h + 2 * m, x: m, y: m, w, h };
  }
  const [a, b] = PAPER[size];
  // Sideways paper for sideways sheets (or pictures).
  const wide = sheet ? sheet.w > sheet.h : pic.w > pic.h;
  const [pageW, pageH] = wide ? [b, a] : [a, b];
  const room = { w: Math.max(1, pageW - 2 * m), h: Math.max(1, pageH - 2 * m) };
  if (!sheet) {
    const k = Math.min(room.w / pic.w, room.h / pic.h);
    const w = pic.w * k;
    const h = pic.h * k;
    return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  }
  // The paper as wide as the page: the content keeps its real size and place on it...
  const k = pageW / sheet.w;
  let w = pic.w * k;
  let h = pic.h * k;
  let left = sheet.x * k;
  let top = sheet.y * k;
  // ...shrunk only if it doesn't fit inside the margins...
  const fit = Math.min(1, room.w / w, room.h / h);
  if (fit < 1) {
    w *= fit;
    h *= fit;
    left *= fit;
    top *= fit;
  }
  // ...and moved in from the edges to keep the margins.
  left = Math.min(Math.max(left, m), pageW - m - w);
  top = Math.min(Math.max(top, m), pageH - m - h);
  return { pageW, pageH, x: left, y: pageH - top - h, w, h };
}
