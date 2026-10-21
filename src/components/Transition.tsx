import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { prefersReducedMotion } from '../lib/theme';

type Launch = (e: MouseEvent | null, slug: string) => void;

const LaunchContext = createContext<Launch>(() => {});

/**
 * Opens a page through the block-wipe transition. `target` is a tool slug, or a path starting with "/".
 * Pass the click event so the wave starts under the cursor.
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

const COLS = 16;
const ROWS = 10;
const STEP = 22; // ms of delay per cell of distance
const BLOCK = 300; // ms each block takes to scale
const HOLD = 120; // ms the covered screen holds before uncovering

type Cell = { lit: boolean; delay: number };

export const scrollToTop = () => document.getElementById('scroll')?.scrollTo(0, 0);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [phase, setPhase] = useState<null | 'cover' | 'uncover'>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [slug, setSlug] = useState('');
  const timers = useRef<number[]>([]);
  const covering = useRef(false);

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
      if (covering.current) return;
      clear();
      const to = target.startsWith('/') ? target : `/t/${target}`;
      // Already there (e.g. the logo on the home page): just go back to the top. A different query
      // ("All tools" from a filtered home page) is a different page.
      if (to === pathname + search) {
        scrollToTop();
        return;
      }
      if (prefersReducedMotion()) {
        navigate(to);
        return;
      }

      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 800;
      const x = e && e.clientX ? e.clientX : w / 2;
      const y = e && e.clientY ? e.clientY : h / 2;
      const ox = Math.min(COLS - 1, Math.max(0, Math.floor((x / w) * COLS)));
      const oy = Math.min(ROWS - 1, Math.max(0, Math.floor((y / h) * ROWS)));
      const next: Cell[] = [];
      let max = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const delay = Math.round(Math.hypot(c - ox, r - oy) * STEP);
          max = Math.max(max, delay);
          next.push({ lit: (c * 7 + r * 13) % 11 === 0, delay });
        }
      }

      covering.current = true;
      setCells(next);
      // The label shows the page's name: "unktilz/skin-editor", "unktilz/changelog".
      setSlug(to.split('?')[0].replace(/^\/(t\/)?/, ''));
      setPhase('cover');
      // Route changes only once the screen is fully covered, then the same wave uncovers it.
      timers.current.push(
        window.setTimeout(() => {
          covering.current = false;
          navigate(to);
          scrollToTop();
          setPhase('uncover');
          timers.current.push(window.setTimeout(() => setPhase(null), max + HOLD + 360));
        }, max + BLOCK + 20),
      );
    },
    [navigate, pathname, search],
  );

  return (
    <LaunchContext.Provider value={launch}>
      {children}
      {phase && (
        <>
          <div key={phase} className={`boot${phase === 'uncover' ? ' out' : ''}`} aria-hidden="true">
            {cells.map((c, i) => (
              <div
                key={i}
                className="cell"
                style={{
                  background: c.lit ? '#b6f24a' : '#0b0d10',
                  animationDelay: `${phase === 'cover' ? c.delay : c.delay + HOLD}ms`,
                }}
              />
            ))}
          </div>
          {phase === 'uncover' && (
            <div className="bootlabel" aria-hidden="true">
              {/* i18n-ignore */}› unktilz{slug ? `/${slug}` : ''}
              <span className="bootcaret" />
            </div>
          )}
        </>
      )}
    </LaunchContext.Provider>
  );
}
