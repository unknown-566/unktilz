import { useEffect, useState } from 'react';
import { HomeCrumb } from '../components/HomeCrumb';
import { t } from '../lib/i18n-core';

const ISSUES = 'https://github.com/unknown-566/unktilz/issues';

export default function Request() {
  const [name, setName] = useState('');
  const [what, setWhat] = useState('');
  useEffect(() => {
    document.title = t('Request a tool · unktilz');
  }, []);

  // The request is written on GitHub in English, whatever language the site is in. i18n-ignore
  const title = `Tool request: ${name.trim()}`;
  const body = `**What should it do?**\n${what.trim()}\n`; // i18n-ignore
  const href = `${ISSUES}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const ready = name.trim().length > 0;

  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <HomeCrumb />
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('request')}</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{t('Request a tool')}</h1>
        </div>
        <p className="tool-desc">{t('Missing something you keep searching for, or is a tool broken? Write it down and send it as a request on GitHub.')}</p>
      </div>
      <section className="panel" aria-labelledby="rq-title">
        <h2 id="rq-title" className="panel-title">
          {t('// your idea')}
        </h2>
        <div className="field">
          <label htmlFor="rq-name">{t('Name of the tool or problem')}</label>
          <input id="rq-name" className="input" value={name} maxLength={80} autoComplete="off" placeholder={t('e.g. Subtitle converter')} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rq-what">{t('What should it do?')}</label>
          <textarea id="rq-what" className="textarea" rows={5} value={what} maxLength={2000} placeholder={t('What goes in, what comes out, and what you’d use it for.')} onChange={(e) => setWhat(e.target.value)} />
        </div>
        <div className="inline">
          <a className="btn btn-primary" href={ready ? href : undefined} aria-disabled={!ready} target="_blank" rel="noopener noreferrer">
            {t('Continue on GitHub')} ↗
          </a>
          <a className="btn" href={ISSUES} target="_blank" rel="noopener noreferrer">
            {t('See other requests')}
          </a>
        </div>
        <p className="note">{t('GitHub opens in a new tab with your text filled in; there you press “Create”. It needs a free GitHub account. Nothing is sent until then.')}</p>
      </section>
    </div>
  );
}
