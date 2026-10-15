import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useLaunch } from './Transition';

export function Header() {
  const [theme, toggle] = useTheme();
  const launch = useLaunch();
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
        <span>unktilz</span>
        <span>made by unknown_56</span>
      </div>
    </footer>
  );
}
