import { useEffect } from 'react';
import { GoLink } from '../components/Transition';
import { UpdateCheck } from '../components/UpdateCheck';
import changelog from '../../CHANGELOG.md?raw';
import { Markdown } from '../lib/markdown';
import { APP_VERSION, changelogSections } from '../lib/updates';
import { t, tn } from '../lib/i18n';

export default function Changelog() {
  const sections = changelogSections(changelog);

  useEffect(() => {
    document.title = t('Changelog · unktilz');
  }, []);

  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <GoLink to="/">{t('tools')}</GoLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('changelog')}</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{t('Changelog')}</h1>
        </div>
        <p className="tool-desc">
          {tn('You have version {v}.', { v: <span className="mono accent">{APP_VERSION}</span> })}
        </p>
      </div>

      <section className="panel" aria-label={t('Updates')}>
        <UpdateCheck />
      </section>

      <section className="panel" aria-label={t('What changed')}>
        <h2 className="panel-title">{t('// what changed')}</h2>
        {sections.map((s) => (
          <div key={s.version} className="changelog-entry">
            <h3 className="mono">
              {s.version} <span className="muted">{s.date}</span>
              {s.version === APP_VERSION && <span className="pill">{t('your version')}</span>}
            </h3>
            <Markdown text={s.summary} />
            {s.details && (
              <details className="changelog-more">
                <summary>{t('details')}</summary>
                <Markdown text={s.details} />
              </details>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
