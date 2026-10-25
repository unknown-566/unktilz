import { useEffect } from 'react';
import { GoLink } from './Transition';
import { t } from '../lib/i18n-core';

/**
 * Shown instead of a page (a tool) that failed while drawing. The header, queue and footer stay, so
 * running jobs and the rest of the site still work.
 */
export function PageError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  useEffect(() => {
    document.title = t('Something went wrong · unktilz');
  }, []);
  // A page part that couldn't be downloaded (offline, or the site was updated meanwhile).
  const notLoaded = /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(error.message);
  return (
    <div className="wrap tool-wrap" role="alert">
      <div className="tool-head">
        <div className="kicker">{t('// error')}</div>
        <div className="title-row">
          <h1>{notLoaded ? t('This page couldn’t be loaded') : t('Something went wrong on this page')}</h1>
        </div>
        <p className="tool-desc">
          {notLoaded
            ? t('A part of the site didn’t download. Check your internet connection (or the site was just updated) and reload the page.')
            : t('It ran into an error and stopped. Your saved things stay. Reload the page or try again; if it keeps happening, tell us through “Request a tool”.')}
        </p>
      </div>
      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          {t('Reload page')}
        </button>
        {!notLoaded && (
          <button type="button" className="btn" onClick={onRetry}>
            {t('Try again')}
          </button>
        )}
        <GoLink to="/" className="btn">
          {t('All tools')}
        </GoLink>
      </div>
      <details className="changelog-more">
        <summary>{t('details')}</summary>
        <pre className="mono page-error-msg">{error.message || String(error)}</pre>
      </details>
    </div>
  );
}
