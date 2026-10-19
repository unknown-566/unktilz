import { useEffect, useRef } from 'react';
import changelog from '../../CHANGELOG.md?raw';
import { Markdown } from '../lib/markdown';
import { APP_VERSION, changelogSections, compareVersions } from '../lib/updates';
import { markSeen, seenVersion } from './whatsNewSeen';
import { GoLink } from './Transition';

/** How many versions the popup lists at most (after a big update, the rest is on the changelog page). */
const MAX = 4;

/**
 * Pops up once after the site got a new version: what changed since the version last seen here (or
 * just the newest one the first time).
 */
export default function WhatsNew({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const seen = seenVersion();
  const all = changelogSections(changelog).filter((s) => compareVersions(s.version, APP_VERSION) <= 0);
  const fresh = seen ? all.filter((s) => compareVersions(s.version, seen) > 0) : all.slice(0, 1);
  const shown = fresh.slice(0, MAX);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => {
    markSeen();
    dialog.current?.close();
    onClose();
  };

  if (!shown.length) return null;
  return (
    <dialog
      ref={dialog}
      className="whats-new"
      aria-labelledby="whats-new-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === dialog.current && close()}
    >
      <div className="whats-new-body">
        <h2 id="whats-new-title">What’s new in unktilz {APP_VERSION}</h2>
        <div className="whats-new-list">
          {shown.map((s) => (
            <div key={s.version} className="changelog-entry">
              <h3 className="mono">
                {s.version} <span className="muted">{s.date}</span>
              </h3>
              <Markdown text={s.body} />
            </div>
          ))}
        </div>
        <div className="whats-new-foot">
          {fresh.length > MAX ? (
            <GoLink to="/changelog" onClick={close}>
              {fresh.length - MAX} more version{fresh.length - MAX === 1 ? '' : 's'} in the changelog
            </GoLink>
          ) : (
            <GoLink to="/changelog" onClick={close}>
              whole changelog
            </GoLink>
          )}
          <button type="button" className="btn btn-primary" onClick={close} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}
