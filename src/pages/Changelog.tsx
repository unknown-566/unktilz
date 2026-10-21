import { useEffect, useState } from 'react';
import { GoLink } from '../components/Transition';
import changelog from '../../CHANGELOG.md?raw';
import { Markdown } from '../lib/markdown';
import { APP_VERSION, changelogSections, checkForUpdate, compareVersions, remoteChangelog } from '../lib/updates';
import { t, tn } from '../lib/i18n';

type Check = { state: 'idle' | 'checking' | 'error' } | { state: 'done'; latest: string; newer: { version: string; date: string; body: string }[] };

export default function Changelog() {
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const sections = changelogSections(changelog);

  useEffect(() => {
    document.title = t('Changelog · unktilz');
  }, []);

  const run = async () => {
    setCheck({ state: 'checking' });
    try {
      const info = await checkForUpdate();
      // Show what the newer versions bring, straight from the changelog on GitHub.
      const newer = info.newer ? changelogSections(await remoteChangelog()).filter((s) => compareVersions(s.version, APP_VERSION) > 0) : [];
      setCheck({ state: 'done', latest: info.latest, newer });
    } catch {
      setCheck({ state: 'error' });
    }
  };

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
        <div className="opt-row">
          <h2 className="panel-title">{t('// updates')}</h2>
          <button type="button" className="btn btn-primary" onClick={run} disabled={check.state === 'checking'}>
            {check.state === 'checking' ? t('Checking…') : t('Check for updates')}
          </button>
        </div>
        {check.state === 'idle' && <p className="note">{t('Asks GitHub which version is the newest. Needs the internet.')}</p>}
        {check.state === 'error' && (
          <p className="error-text" role="alert">
            {t('Couldn’t reach GitHub. Check your internet connection and try again.')}
          </p>
        )}
        {check.state === 'done' && check.newer.length === 0 && (
          <p className="note" role="status" style={{ color: 'var(--fg)' }}>
            {t('You’re up to date ({v} is the newest).', { v: APP_VERSION })}
          </p>
        )}
        {check.state === 'done' && check.newer.length > 0 && (
          <div role="status" className="update-box">
            <p>
              <b>{t('Version {v} is out.', { v: check.latest })}</b>{' '}
              {tn('To update, close the site’s window and double-click {file} in the unktilz folder. Your saved things stay.', { file: <span className="mono">{'update.bat' /* i18n-ignore */}</span> })}
            </p>
            {check.newer.map((s) => (
              <div key={s.version} className="changelog-entry">
                <h3 className="mono">
                  {s.version} <span className="muted">{s.date}</span>
                </h3>
                <Markdown text={s.body} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-label={t('What changed')}>
        <h2 className="panel-title">{t('// what changed')}</h2>
        {sections.map((s) => (
          <div key={s.version} className="changelog-entry">
            <h3 className="mono">
              {s.version} <span className="muted">{s.date}</span>
              {s.version === APP_VERSION && <span className="pill">{t('your version')}</span>}
            </h3>
            <Markdown text={s.body} />
          </div>
        ))}
      </section>
    </div>
  );
}
