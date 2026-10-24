import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useLaunch } from './Transition';
import { APP_VERSION, useUpdateStatus } from '../lib/updates';
import { getLang, plural, setLang, t, tc } from '../lib/i18n';
import { useQueue } from '../queue/store';

/**
 * Switching the language reloads the page. Downloads carry on after it, but work made from what a
 * page holds in memory (GIF maker, crop…) would stop, so that asks first.
 */
function switchLang(to: 'en' | 'cs') {
  const lost = useQueue.getState().jobs.filter((j) => j.task && !j.resume && (j.status === 'running' || j.status === 'queued')).length;
  if (
    lost &&
    !window.confirm(
      plural(
        lost,
        ['Changing the language reloads the page and stops {n} job that is being made. Change it anyway?', 'Changing the language reloads the page and stops {n} jobs that are being made. Change it anyway?'],
        ['Změna jazyka obnoví stránku a zastaví {n} rozdělanou úlohu. Přesto změnit?', 'Změna jazyka obnoví stránku a zastaví {n} rozdělané úlohy. Přesto změnit?', 'Změna jazyka obnoví stránku a zastaví {n} rozdělaných úloh. Přesto změnit?'],
      ),
    )
  )
    return;
  setLang(to);
}

export function Header() {
  const [theme, toggle] = useTheme();
  const launch = useLaunch();
  const update = useUpdateStatus();
  const lang = getLang();
  // The language button speaks the language it switches to, so it reads right to whoever needs it.
  const other = lang === 'en' ? { label: 'Přepnout do češtiny' } : { label: 'Switch to English' }; // i18n-ignore
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo" onClick={(e) => launch(e, '/')}>
          <span className="logo-mark" aria-hidden="true">
            {/* i18n-ignore */}
            &gt;_
          </span>
          <span>unktilz</span>
        </Link>
        <nav className="nav" aria-label={t('Main')}>
          {update?.newer && (
            <Link to="/changelog" className="update-pill" title={t('Version {latest} is out (you have {current})', { latest: update.latest, current: APP_VERSION })} onClick={(e) => launch(e, '/changelog')}>
              {t('update available')}
            </Link>
          )}
          <NavLink to="/" end onClick={(e) => launch(e, '/')}>
            {t('All tools')}
          </NavLink>
          <NavLink to="/request" onClick={(e) => launch(e, '/request')}>
            {t('Request a tool')}
          </NavLink>
          <button type="button" className="theme-btn" onClick={toggle} aria-label={theme === 'dark' ? t('Switch to the light theme') : t('Switch to the dark theme')}>
            {t('theme: {theme}', { theme: theme === 'dark' ? tc('theme', 'dark') : tc('theme', 'light') })}
          </button>
          <button type="button" className="theme-btn" onClick={() => switchLang(lang === 'en' ? 'cs' : 'en')} aria-label={other.label} title={other.label}>
            {t('lang: en')}
          </button>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const launch = useLaunch();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-links">
          <span>unktilz</span>
          <Link to="/changelog" className="mono" title={t('What changed, and check for updates')} onClick={(e) => launch(e, '/changelog')}>
            v{APP_VERSION}
          </Link>
        </span>
        <span className="footer-links">
          <Link to="/backup" onClick={(e) => launch(e, '/backup')}>
            {t('backup')}
          </Link>
          <span>
            {t('made by')}{' '}
            <a href="https://github.com/unknown-566" target="_blank" rel="noopener noreferrer">
              unknown_56
            </a>
          </span>
        </span>
      </div>
    </footer>
  );
}
