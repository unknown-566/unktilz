import { createContext, useCallback, useContext, useEffect, useRef, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { prefersReducedMotion } from '../lib/theme';

type Launch = (e: MouseEvent | null, slug: string) => void;

const LaunchContext = createContext<Launch>(() => {});

/**
 * Opens a page through the page transition (a short fade). `target` is a tool slug, or a path
 * starting with "/". Pass the click event so new-tab clicks (Ctrl, Shift, middle button) stay the browser's.
 */
export const useLaunch = () => useContext(LaunchContext);

/** A link to another page of the site that opens it through the transition. */
export function GoLink({ to, onClick, ...rest }: ComponentProps<typeof Link> & { to: string }) {
  const launch = useLaunch();
  return (
    <Link
      to={to}
      onClick={(e) => {
        onClick?.(e);
        launch(e, to);
      }}
      {...rest}
    />
  );
}

/** How long the old page takes to fade out (matches main.page-out in styles.css). */
const OUT = 140;
/** How long the new page takes to come in (matches main.page-in). */
const IN = 260;

export const scrollToTop = () => document.getElementById('scroll')?.scrollTo(0, 0);

const main = () => document.querySelector('main');

export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const launch = useCallback<Launch>(
    (e, target) => {
      // Let the browser handle new-tab clicks.
      if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      e?.preventDefault();
      const to = target.startsWith('/') ? target : `/t/${target}`;
      // Already there (e.g. the logo on the home page): just go back to the top. A different query
      // ("All tools" from a filtered home page) is a different page.
      if (to === pathname + search) {
        scrollToTop();
        return;
      }
      if (busy.current) return;
      if (prefersReducedMotion()) {
        navigate(to);
        return;
      }

      clear();
      busy.current = true;
      const m = main();
      m?.classList.remove('page-in');
      m?.classList.add('page-out');
      // The route changes once the old page has faded, then the new one comes in.
      timers.current.push(
        window.setTimeout(() => {
          navigate(to);
          scrollToTop();
          const n = main();
          n?.classList.remove('page-out');
          n?.classList.add('page-in');
          busy.current = false;
          timers.current.push(window.setTimeout(() => n?.classList.remove('page-in'), IN + 40));
        }, OUT),
      );
    },
    [navigate, pathname, search],
  );

  return <LaunchContext.Provider value={launch}>{children}</LaunchContext.Provider>;
}
