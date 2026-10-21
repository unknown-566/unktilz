import { plural, t } from './i18n-core';

/**
 * Pages as people type them, for a document with `count` pages: "1-3, 5", "3, 1-2" (keeps that
 * order), "5-3" (backwards), "7-" (to the end), "-3" (from the start), "end", "last" or "konec".
 * Empty means every page. Returns 0-based page indexes; repeats are kept (to duplicate a page).
 */
export function parsePages(text: string, count: number): number[] {
  // "1 - 3" is one range, not three parts.
  const s = text.trim().toLowerCase().replace(/\s*[-–]\s*/g, '-');
  if (!s) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  const page = (word: string) => {
    if (word === 'end' || word === 'last' || word === 'konec') return count;
    if (!/^\d+$/.test(word)) throw new Error(t('“{word}” isn’t a page number. Use numbers like 1-3, 5.', { word }));
    const n = Number(word);
    if (n < 1 || n > count)
      throw new Error(
        plural(count, ['Page {page} doesn’t exist: the PDF has {n} page.', 'Page {page} doesn’t exist: the PDF has {n} pages.'], ['Stránka {page} neexistuje: PDF má {n} stránku.', 'Stránka {page} neexistuje: PDF má {n} stránky.', 'Stránka {page} neexistuje: PDF má {n} stránek.'], { page: n }),
      );
    return n;
  };
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^([^-]*)-([^-]*)$/);
    if (!m) {
      out.push(page(part) - 1);
      continue;
    }
    const a = m[1] ? page(m[1]) : 1;
    const b = m[2] ? page(m[2]) : count;
    const step = a <= b ? 1 : -1;
    for (let p = a; p !== b + step; p += step) out.push(p - 1);
  }
  return out;
}
