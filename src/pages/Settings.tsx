import { useEffect } from 'react';
import { GoLink } from '../components/Transition';
import { UpdateCheck } from '../components/UpdateCheck';
import { APP_VERSION } from '../lib/updates';
import { THEME_IDS, setTheme, themeName, useTheme, type Theme, type ThemeChoice } from '../lib/theme';
import { getLang, t, tn } from '../lib/i18n';
import { switchLang } from '../lib/switchLang';

/** A small page in a theme's colors; [data-theme] gives it that theme whatever the site uses. */
function Swatch({ theme }: { theme: Theme }) {
  return (
    <span className="theme-swatch" data-theme={theme} aria-hidden="true">
      <span className="ts-panel">
        <span className="ts-text">{'Aa' /* i18n-ignore */}</span>
        <span className="ts-line" />
        <span className="ts-accent" />
      </span>
    </span>
  );
}

export default function Settings() {
  const [, picked] = useTheme();
  const lang = getLang();

  useEffect(() => {
    document.title = t('Settings · unktilz');
  }, []);

  const choices: ThemeChoice[] = ['system', ...THEME_IDS];

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

      <section className="panel" aria-labelledby="set-theme">
        <h2 id="set-theme" className="panel-title">
          {t('// theme')}
        </h2>
        <div className="theme-grid" role="radiogroup" aria-labelledby="set-theme">
          {choices.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={picked === id} className="theme-card" onClick={() => setTheme(id)}>
              {id === 'system' ? (
                <span className="theme-split">
                  <Swatch theme="dark" />
                  <Swatch theme="light" />
                </span>
              ) : (
                <Swatch theme={id} />
              )}
              <span className="theme-name">{themeName(id)}</span>
            </button>
          ))}
        </div>
        {picked === 'system' && <p className="note">{t('Dark or light, the same as your computer.')}</p>}
      </section>

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
        <p className="note">{t('Changing it reloads the page. Minecraft names stay in English, as in the game.')}</p>
      </section>

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
          <dd>{tn('{key} anywhere jumps to the tool search.', { key: <kbd className="kbd">{'Ctrl+K' /* i18n-ignore */}</kbd> })}</dd>
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
