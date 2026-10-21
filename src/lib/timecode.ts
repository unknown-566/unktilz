import { t } from './i18n-core';

/**
 * Times as people type them: "83", "1:23", "1:02:03", "1:23.5" (seconds, m:ss, h:mm:ss).
 * Empty means "not set" (null); anything else that isn't a time throws.
 */
export function parseTime(text: string, what = t('Time')): number | null {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$|^\d+:\d{1,2}(\.\d+)?$|^\d+:\d{1,2}:\d{1,2}(\.\d+)?$/.test(s)) throw new Error(t('{what} “{text}” isn’t a time. Use seconds (90) or minutes:seconds (1:30).', { what, text: text.trim() }));
  const parts = s.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** 83.5 → "83.5" in the plain seconds form ffmpeg takes. */
export const ffTime = (seconds: number) => String(Math.round(seconds * 1000) / 1000);

/**
 * ffmpeg arguments for a start/end trim: `before` goes in front of -i (fast seek), `after` after it.
 * Throws when the times are typed wrong or the end isn't after the start.
 */
export function trimArgs(start: string, end: string) {
  const a = parseTime(start, t('Start'));
  const b = parseTime(end, t('End'));
  if (a !== null && b !== null && b <= a) throw new Error(t('The end has to be after the start.'));
  const before = a ? ['-ss', ffTime(a)] : [];
  const after = b !== null ? ['-t', ffTime(b - (a ?? 0))] : [];
  return { before, after, trimmed: a !== null || b !== null };
}
