/**
 * The page lists of Organize and Split as plain data, so the moving, cutting and naming can be
 * tested on their own.
 */

/** A page in a grid: page `index` of source PDF `src`, turned by `rotate` (clockwise, on top of its own turn), or an empty page. */
export type GridItem = { key: string; src: number; index: number; rotate: number; blank?: [number, number] };

let next = 0;
export const newKey = () => `p${++next}`;

/** Every page of a source, in order. */
export const pagesOf = (src: number, count: number): GridItem[] => Array.from({ length: count }, (_, index) => ({ key: newKey(), src, index, rotate: 0 }));

/**
 * Moves the pages with these keys (keeping their order among themselves) so they land before the
 * page that was at position `to` (`to` = length: to the end).
 */
export function moveItems<T extends { key: string }>(items: T[], keys: string[], to: number): T[] {
  const moving = new Set(keys);
  const picked = items.filter((it) => moving.has(it.key));
  if (!picked.length) return items;
  const before = items.slice(0, to).filter((it) => !moving.has(it.key));
  const after = items.slice(to).filter((it) => !moving.has(it.key));
  return [...before, ...picked, ...after];
}

/** Turns the pages with these keys by `by` degrees (90 = right, -90 = left). */
export const rotateItems = (items: GridItem[], keys: Set<string>, by: number) =>
  items.map((it) => (keys.has(it.key) ? { ...it, rotate: (((it.rotate + by) % 360) + 360) % 360 } : it));

/** The parts a document of `count` pages falls into with a cut after each page index in `cuts`. */
export function partsFromCuts(count: number, cuts: Set<number>): number[][] {
  const parts: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < count; i++) {
    cur.push(i);
    if (cuts.has(i) && i < count - 1) {
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** Cuts after every `n` pages. */
export function cutsEvery(count: number, n: number): Set<number> {
  const cuts = new Set<number>();
  const step = Math.max(1, Math.floor(n));
  for (let i = step - 1; i < count - 1; i += step) cuts.add(i);
  return cuts;
}

/** Page numbers as people read them: [0,1,2,4] → "1–3, 5". */
export function rangeLabel(indexes: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    let j = i;
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j++;
    out.push(j > i ? `${indexes[i] + 1}–${indexes[j] + 1}` : `${indexes[i] + 1}`);
    i = j;
  }
  return out.join(', ');
}

/** A file name without characters Windows refuses, ending in .pdf. */
export function pdfName(name: string, fallback: string) {
  const clean = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '').trim();
  return `${clean || fallback}.pdf`;
}
