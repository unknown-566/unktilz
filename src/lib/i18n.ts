import { createElement, Fragment, type ReactNode } from 'react';
import { applyLang, getLang, t, type Lang } from './i18n-core';

export { fmtDate, fmtNum, fmtTime, getLang, plural, t, tc, tx, type Lang } from './i18n-core';

// The site's language: English unless Czech was picked (remembered in this browser). Everything is
// translated when its module first runs, so the language is set before the app loads (main.tsx)
// and a switch reloads the page.
const KEY = 'unktilz-lang';

/** Before the app loads: the saved language, with its dictionary. */
export async function initLang() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: English */
  }
  if (saved === 'cs') {
    try {
      await applyLang('cs');
    } catch {
      /* the dictionary didn't load (offline right after an update): English for now */
    }
  }
  document.documentElement.lang = getLang();
}

/** Saves the language and reloads the page in it. */
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage blocked: nothing to remember it by */
    return;
  }
  location.reload();
}

/**
 * A sentence with pieces of page in it (a link, bold text…), translated whole so the word order can
 * change: `tn('You have version {v}.', { v: <b>1.2</b> })`.
 */
export function tn(en: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = t(en)
    .split(/(\{\w+\})/)
    .filter((p) => p !== '')
    .map((part, i) => {
      const k = part.match(/^\{(\w+)\}$/)?.[1];
      return createElement(Fragment, { key: i }, k !== undefined && k in nodes ? nodes[k] : part);
    });
  return createElement(Fragment, null, ...parts);
}
