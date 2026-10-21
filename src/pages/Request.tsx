import { useEffect } from 'react';
import { GoLink } from '../components/Transition';
import { t } from '../lib/i18n-core';

export default function Request() {
  useEffect(() => {
    document.title = t('Request a tool · unktilz');
  }, []);
  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <GoLink to="/">{t('tools')}</GoLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('request')}</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{t('Request a tool')}</h1>
        </div>
        <p className="tool-desc">{t('Missing something you keep searching for? Soon you\'ll be able to suggest it here.')}</p>
      </div>
      <section className="panel" aria-labelledby="soon">
        <h2 id="soon" className="panel-title">
          {t('// coming soon')}
        </h2>
        <p className="note" style={{ color: 'var(--fg)' }}>
          {t('Tool requests aren\'t open yet. Check back later.')}
        </p>
      </section>
    </div>
  );
}
