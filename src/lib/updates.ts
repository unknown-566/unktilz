import { useEffect, useState } from 'react';
import { t } from './i18n-core';

export const APP_VERSION = __APP_VERSION__;

const RAW = 'https://raw.githubusercontent.com/unknown-566/unktilz/main';
const CACHE = 'unktilz-update-check';
const DAY = 24 * 60 * 60 * 1000;

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
  return info;
}

/** The newest changelog on GitHub, for showing what an update brings. */
export async function remoteChangelog() {
  const res = await fetch(`${RAW}/CHANGELOG.md?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(t('GitHub answered {status}', { status: res.status }));
  return res.text();
}

/** Splits a changelog into its "## [x.y.z] - date" sections. */
export function changelogSections(md: string) {
  const parts = md.split(/^## /m).slice(1);
  return parts.map((p) => {
    const m = p.match(/^\[?([\d.]+)\]?(?:\s*-\s*(.*))?/);
    return { version: m?.[1] ?? '', date: m?.[2]?.trim() ?? '', body: p.slice(p.indexOf('\n') + 1).trim() };
  });
}

/**
 * Update status for the header: the last known answer right away, and a fresh check at most once
 * a day in the background. Being offline just means no note.
 */
export function useUpdateStatus() {
  const [info, setInfo] = useState<UpdateInfo | null>(cached);
  useEffect(() => {
    const c = cached();
    if (c && Date.now() - c.checkedAt < DAY) return;
    checkForUpdate().then(setInfo, () => {});
  }, []);
  return info;
}
