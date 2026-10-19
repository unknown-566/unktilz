import { APP_VERSION, compareVersions } from '../lib/updates';

// The last version whose "what's new" popup was seen in this browser. Only a convenience: if the
// browser forgets it, the popup just shows once more.
const KEY = 'unktilz-seen-version';

export function seenVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markSeen() {
  try {
    localStorage.setItem(KEY, APP_VERSION);
  } catch {
    /* private mode: shows again next time */
  }
}

/** Whether this version is newer than the one last seen here. */
export function hasUnseenVersion() {
  const seen = seenVersion();
  return !seen || compareVersions(APP_VERSION, seen) > 0;
}
