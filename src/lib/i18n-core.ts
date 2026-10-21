/**
 * Translations. The English text is the key: `t('Save PDF')`, `t('{n} files', { n })`. The Czech
 * dictionary (src/i18n/cs/) is loaded only when Czech is picked; anything it lacks stays English.
 * No React here, so the workers use it too (src/lib/i18n.ts has the hook and the switch).
 */

export type Lang = 'en' | 'cs';
export const LANGS: Lang[] = ['en', 'cs'];

let lang: Lang = 'en';
let dict: Record<string, string> = {};
let loading: Promise<Record<string, string>> | null = null;
const missing = new Set<string>();

export const getLang = () => lang;

/** The Czech dictionary, loaded once. */
export const loadDict = () => (loading ??= import('../i18n/cs').then((m) => m.default));

/** Switches the language for `t()` (loading the dictionary first when needed). */
export async function applyLang(l: Lang) {
  if (l === 'cs') dict = await loadDict();
  lang = l;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The text in the current language; `{name}` is filled from `vars`. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s: string | undefined;
  if (lang === 'cs') {
    s = dict[en];
    // (import.meta.env is Vite's; the downloader's server runs this file in plain Node too.)
    if (s === undefined && (import.meta as { env?: { DEV?: boolean } }).env?.DEV && en.trim() && !missing.has(en)) {
      missing.add(en);
      console.warn(`[i18n] missing Czech for: ${JSON.stringify(en)}`);
    }
  }
  // "context|text" keys (see tc) show just the text untranslated.
  s ??= en.replace(/^[\w-]+\|/, '');
  return vars ? fill(s, vars) : s;
}

/**
 * A short text that means different things in different places ("dark" theme, "dark" colour): the
 * dictionary has it as "context|text", English shows just the text.
 */
export const tc = (context: string, en: string, vars?: Record<string, string | number>) => t(`${context}|${en}`, vars);

/** Marks a text kept in a constant as one to translate (shown later with `t()`); returns it as is. */
export const tx = <T extends string>(en: T): T => en;

/** Czech has three forms by number: 1 soubor, 2–4 soubory, 5 souborů (and 1,5 souboru). */
function csForm(n: number) {
  if (!Number.isInteger(n)) return 1;
  const a = Math.abs(n);
  return a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2;
}

/**
 * The right form for a number, with `{n}` filled in (formatted for the language):
 * `plural(3, ['{n} page', '{n} pages'], ['{n} stránka', '{n} stránky', '{n} stránek'])`.
 */
export function plural(n: number, en: [one: string, other: string], cs: [one: string, few: string, many: string], vars?: Record<string, string | number>) {
  const s = lang === 'cs' ? cs[csForm(n)] : en[Math.abs(n) === 1 ? 0 : 1];
  return fill(s, { n: fmtNum(n), ...vars });
}

const locale = () => (lang === 'cs' ? 'cs-CZ' : 'en-US');

/** A number as people write it: 12,345.5 in English, 12 345,5 in Czech. */
export const fmtNum = (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString(locale(), opts);

/** A date (and time) in the language's usual way. */
export const fmtDate = (d: Date, opts?: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale(), opts);
export const fmtTime = (d: Date, opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }) => d.toLocaleTimeString(locale(), opts);
