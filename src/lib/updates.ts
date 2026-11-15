import { useEffect, useState } from 'react';
import { t } from './i18n-core';

export const APP_VERSION = __APP_VERSION__;

const RAW = 'https://raw.githubusercontent.com/unknown-566/unktilz/main';
const CACHE = 'unktilz-update-check';

/** -1, 0 or 1, comparing "1.2.3"-style versions number by number. */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type UpdateInfo = { latest: string; newer: boolean; checkedAt: number };

function cached(): UpdateInfo | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as UpdateInfo | null;
    // A cached answer from before this copy was updated is meaningless.
    return c ? { ...c, newer: compareVersions(c.latest, APP_VERSION) > 0 } : null;
  } catch {
    return null;
  }
}

/** Asks GitHub which version is the newest. Throws when offline. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const res = await fetch(`${RAW}/package.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(t('GitHub answered {status}', { status: res.status }));
  const { version } = (await res.json()) as { version: string };
  const info = { latest: version, newer: compareVersions(version, APP_VERSION) > 0, checkedAt: Date.now() };
  try {
    localStorage.setItem(CACHE, JSON.stringify(info));
  } catch {
    /* ignore */
  }
  // Everything that shows the status (header, notice) hears about it, whoever asked.
  publish(info);
  return info;
}

/** The newest changelog on GitHub, for showing what an update brings. */
export async function remoteChangelog() {
  const res = await fetch(`${RAW}/CHANGELOG.md?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(t('GitHub answered {status}', { status: res.status }));
  return res.text();
}

export type ChangelogSection = { version: string; date: string; body: string; summary: string; details: string };

/**
 * Splits a changelog into its "## [x.y.z] - date" sections. `summary` is the short list before the
 * first "###" heading and `details` the Added / Changed / Fixed part; an entry without a short list
 * (older ones) has its whole text as the summary.
 */
export function changelogSections(md: string): ChangelogSection[] {
  const parts = md.split(/^## /m).slice(1);
  return parts.map((p) => {
    const m = p.match(/^\[?([\d.]+)\]?(?:\s*-\s*(.*))?/);
    const body = p.slice(p.indexOf('\n') + 1).trim();
    const cut = body.search(/^### /m);
    const summary = cut < 0 ? body : body.slice(0, cut).trim();
    return { version: m?.[1] ?? '', date: m?.[2]?.trim() ?? '', body, summary: summary || body, details: summary && cut >= 0 ? body.slice(cut).trim() : '' };
  });
}

/** How often the site asks GitHub for a newer version while it's open. */
export const CHECK_EVERY = 2 * 60 * 1000;

// One shared check for the whole page (the header and the update notice both read it).
let current: UpdateInfo | null = cached();
const listeners = new Set<(i: UpdateInfo | null) => void>();
let started = false;

function publish(info: UpdateInfo | null) {
  current = info;
  listeners.forEach((f) => f(info));
}

/** Checks now unless a check (in this tab or another one) happened less than CHECK_EVERY ago. */
function checkIfStale() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const c = cached();
  if (c && Date.now() - c.checkedAt < CHECK_EVERY - 5000) {
    if (c.latest !== current?.latest) publish(c);
    return;
  }
  checkForUpdate().catch(() => {});
}

/**
 * Starts the background check once: right away, then every CHECK_EVERY. A hidden tab doesn't ask;
 * it checks as soon as it's shown again. Another tab's answer arrives through localStorage.
 */
function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  checkIfStale();
  window.setInterval(checkIfStale, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkIfStale();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === CACHE) publish(cached());
  });
}

/** The latest known update status; checks GitHub in the background every two minutes. */
export function useUpdateStatus() {
  const [info, setInfo] = useState<UpdateInfo | null>(current);
  useEffect(() => {
    listeners.add(setInfo);
    setInfo(current);
    start();
    return () => {
      listeners.delete(setInfo);
    };
  }, []);
  return info;
}

const DISMISSED = 'unktilz-update-dismissed';

/** The version whose update notice was closed with "Later" (it doesn't come back for that one). */
export function dismissedVersion() {
  try {
    return localStorage.getItem(DISMISSED);
  } catch {
    return null;
  }
}

export function dismissUpdate(version: string) {
  try {
    localStorage.setItem(DISMISSED, version);
  } catch {
    /* ignore */
  }
}
