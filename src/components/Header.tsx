import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useLaunch } from './Transition';
import { APP_VERSION, useUpdateStatus } from '../lib/updates';

export function Header() {
  const [theme, toggle] = useTheme();
  const launch = useLaunch();
  const update = useUpdateStatus();
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo" onClick={(e) => launch(e, '/')}>
          <span className="logo-mark" aria-hidden="true">
            &gt;_
          </span>
          <span>unktilz</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {update?.newer && (
            <Link to="/changelog" className="update-pill" title={`Version ${update.latest} is out (you have ${APP_VERSION})`}>
              update available
            </Link>
          )}
          <NavLink to="/" end>
            All tools
          </NavLink>
          <NavLink to="/request">Request a tool</NavLink>
          <button type="button" className="theme-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            theme: {theme}
          </button>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-links">
          <span>unktilz</span>
          <Link to="/changelog" className="mono" title="What changed, and check for updates">
            v{APP_VERSION}
          </Link>
        </span>
        <span className="footer-links">
          <Link to="/backup">backup</Link>
          <span>made by unknown_56</span>
        </span>
      </div>
    </footer>
  );
}
