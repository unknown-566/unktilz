import { useState } from 'react';
import { APP_VERSION, dismissedVersion, dismissUpdate, useUpdateStatus } from '../lib/updates';
import { t, tn } from '../lib/i18n';
import { GoLink } from './Transition';

/**
 * A small card in the corner when GitHub has a newer version than this copy (checked every two
 * minutes). "Later" hides it for that version; the header pill stays until the update is done.
 */
export function UpdateNotice() {
  const update = useUpdateStatus();
  const [closed, setClosed] = useState(dismissedVersion);
  if (!update?.newer || closed === update.latest) return null;

  const later = () => {
    dismissUpdate(update.latest);
    setClosed(update.latest);
  };

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <p className="update-notice-title">
        <span className="update-dot" aria-hidden="true" />
        {t('Version {v} is out.', { v: update.latest })} <span className="muted mono">{t('(you have {v})', { v: APP_VERSION })}</span>
      </p>
      <p className="update-notice-text">
        {tn('To update, close the site’s window and open {file} in the unktilz folder. Your saved things stay.', { file: <span className="mono">{'update.bat' /* i18n-ignore */}</span> })}
      </p>
      <div className="update-notice-actions">
        <GoLink to="/changelog" className="btn btn-primary" onClick={later}>
          {t('What’s new')}
        </GoLink>
        <button type="button" className="btn" onClick={later}>
          {t('Later')}
        </button>
      </div>
    </aside>
  );
}
