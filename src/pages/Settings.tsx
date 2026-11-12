import { useEffect } from 'react';
import { GoLink } from '../components/Transition';
import { UpdateCheck } from '../components/UpdateCheck';
import { APP_VERSION } from '../lib/updates';
import { LookSection, ThemeSection } from './settings/Looks';
import { getLang, t, tn } from '../lib/i18n';
import { switchLang } from '../lib/switchLang';
import { setAutoDownload, useAutoDownload, type AutoDownload } from '../lib/autoDownload';
import { CATEGORIES, queueTools } from '../registry';
import { CategoryIcon } from '../components/icons';

export default function Settings() {
  const lang = getLang();

  useEffect(() => {
    document.title = t('Settings · unktilz');
  }, []);

  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <GoLink to="/">{t('tools')}</GoLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('settings')}</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{t('Settings')}</h1>
        </div>
        <p className="tool-desc">{t('The look and language of the site, and which version you have. Saved in this browser.')}</p>
      </div>

      <ThemeSection />

      <LookSection />

      <section className="panel" aria-labelledby="set-lang">
        <h2 id="set-lang" className="panel-title">
          {t('// language')}
        </h2>
        <div className="seg" role="group" aria-labelledby="set-lang">
          <button type="button" aria-pressed={lang === 'en'} onClick={() => lang !== 'en' && switchLang('en')}>
            {'English' /* i18n-ignore */}
          </button>
          <button type="button" aria-pressed={lang === 'cs'} onClick={() => lang !== 'cs' && switchLang('cs')}>
            {'Čeština' /* i18n-ignore */}
          </button>
        </div>
        <p className="note">{t('Changing it reloads the page.')}</p>
      </section>

      <AutoDownloadSection />

      <section className="panel" aria-label={t('Updates')}>
        <UpdateCheck />
      </section>

      <section className="panel" aria-labelledby="set-about">
        <h2 id="set-about" className="panel-title">
          {t('// about')}
        </h2>
        <dl className="about-list">
          <dt>{t('Version')}</dt>
          <dd>
            <span className="mono accent">{APP_VERSION}</span> · <GoLink to="/changelog">{t('what changed')}</GoLink>
          </dd>
          <dt>{t('Your saved things')}</dt>
          <dd>{tn('Only in this browser. {backup} them to keep them safe or move them to another computer.', { backup: <GoLink to="/backup">{t('Back up')}</GoLink> })}</dd>
          <dt>{t('Search')}</dt>
          <dd>{tn('{key} or / anywhere opens the search for tools, pages and themes (also the bar at the top).', { key: <kbd className="kbd">{'Ctrl+K' /* i18n-ignore */}</kbd> })}</dd>
          <dt>{t('Made by')}</dt>
          <dd>
            <a href="https://github.com/unknown-566" target="_blank" rel="noopener noreferrer">
              {'unknown_56' /* i18n-ignore */}
            </a>{' '}
            ·{' '}
            <a href="https://github.com/unknown-566/unktilz" target="_blank" rel="noopener noreferrer">
              {t('source on GitHub')}
            </a>
          </dd>
        </dl>
      </section>
    </div>
  );
}

/** Queue tools by category, in the site's order. */
const QUEUE_GROUPS = CATEGORIES.map((c) => ({ ...c, tools: queueTools.filter((tt) => tt.category === c.id).sort((a, b) => a.order - b.order) })).filter((g) => g.tools.length);

function AutoDownloadSection() {
  const ad = useAutoDownload();
  const modes: { id: AutoDownload['mode']; label: string }[] = [
    { id: 'off', label: t('off') },
    { id: 'all', label: t('every tool') },
    { id: 'custom', label: t('picked tools') },
  ];
  const toggle = (slug: string, on: boolean) => setAutoDownload({ ...ad, tools: on ? [...ad.tools.filter((x) => x !== slug), slug] : ad.tools.filter((x) => x !== slug) });

  return (
    <section className="panel" aria-labelledby="set-dl">
      <h2 id="set-dl" className="panel-title">
        {t('// downloads')}
      </h2>
      <p className="field-label" id="set-dl-auto">
        {t('Download results as soon as they’re done')}
      </p>
      <div className="seg" role="group" aria-labelledby="set-dl-auto">
        {modes.map((m) => (
          <button key={m.id} type="button" aria-pressed={ad.mode === m.id} onClick={() => setAutoDownload({ ...ad, mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="note">
        {t('When a job in the queue is done, the browser saves its result right away, so you don’t have to click download. A job with several results comes as one .zip. It stays in the queue, so you can download it again.')}
      </p>
      {ad.mode === 'custom' && (
        <div className="set-dl-tools">
          <div className="set-dl-actions">
            <button type="button" className="btn btn-sm" onClick={() => setAutoDownload({ ...ad, tools: queueTools.map((tt) => tt.slug) })}>
              {t('pick all')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setAutoDownload({ ...ad, tools: [] })}>
              {t('pick none')}
            </button>
            <span className="muted">{t('{n} of {total} picked', { n: queueTools.filter((tt) => ad.tools.includes(tt.slug)).length, total: queueTools.length })}</span>
          </div>
          {QUEUE_GROUPS.map((g) => (
            <fieldset key={g.id} className="set-dl-group">
              <legend>
                <CategoryIcon category={g.id} /> {g.label}
              </legend>
              <div className="check-grid">
                {g.tools.map((tt) => (
                  <label key={tt.slug} className="check">
                    <input type="checkbox" checked={ad.tools.includes(tt.slug)} onChange={(e) => toggle(tt.slug, e.target.checked)} />
                    {tt.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      {ad.mode !== 'off' && (
        <p className="note">
          {t('When several results download one after another, Chrome asks once whether this site may download multiple files. Choose Allow, or only the first one is saved.')}
        </p>
      )}
    </section>
  );
}
