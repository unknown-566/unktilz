/**
 * Pages as people type them, for a document with `count` pages: "1-3, 5", "3, 1-2" (keeps that
 * order), "5-3" (backwards), "7-" (to the end), "-3" (from the start), "end" or "last".
 * Empty means every page. Returns 0-based page indexes; repeats are kept (to duplicate a page).
 */
export function parsePages(text: string, count: number): number[] {
  // "1 - 3" is one range, not three parts.
  const s = text.trim().toLowerCase().replace(/\s*[-–]\s*/g, '-');
  if (!s) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  const page = (t: string) => {
    if (t === 'end' || t === 'last') return count;
    if (!/^\d+$/.test(t)) throw new Error(`“${t}” isn't a page number. Use numbers like 1-3, 5.`);
    const n = Number(t);
    if (n < 1 || n > count) throw new Error(`Page ${n} doesn't exist: the PDF has ${count} page${count === 1 ? '' : 's'}.`);
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

/** Groups separated by ";" (e.g. "1-3; 4-6"), each parsed like parsePages. */
export function parseGroups(text: string, count: number): number[][] {
  const groups = text.split(';').map((g) => g.trim()).filter(Boolean);
  if (!groups.length) throw new Error('Type the groups of pages, separated by ; (e.g. 1-3; 4-6).');
  return groups.map((g) => parsePages(g, count));
}
