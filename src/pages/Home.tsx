import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { CATEGORIES, groups, matches, tools, type Category } from '../registry';
import { useLaunch } from '../components/Transition';
import { SearchIcon } from '../components/icons';
import { prefersReducedMotion } from '../lib/theme';

const PHRASES = ['server status', 'ogg to mp3', 'json formatter', 'map art', 'nether portal'];

/** The one typing animation on the site: example queries in the search placeholder. */
function useTypedHint(running: boolean) {
  const [state, setState] = useState({ pi: 0, ci: 0, del: false });
  useEffect(() => {
    if (!running) return;
    if (prefersReducedMotion()) {
      setState({ pi: 0, ci: PHRASES[0].length, del: false });
      return;
    }
    let t: number;
    let s = { pi: 0, ci: 0, del: false };
    const step = () => {
      const word = PHRASES[s.pi];
      let next = 75;
      if (!s.del && s.ci < word.length) s = { ...s, ci: s.ci + 1 };
      else if (!s.del) {
        s = { ...s, del: true };
        next = 1800;
      } else if (s.ci > 0) {
        s = { ...s, ci: s.ci - 1 };
        next = 35;
      } else {
        s = { pi: (s.pi + 1) % PHRASES.length, ci: 0, del: false };
        next = 350;
      }
      setState(s);
      t = window.setTimeout(step, next);
    };
    t = window.setTimeout(step, 600);
    return () => clearTimeout(t);
  }, [running]);
  return PHRASES[state.pi].slice(0, state.ci);
}

/**
 * Background grid parallax: the mouse position (−0.5…0.5 from the middle of the window) eases into
 * --px / --py on the element, and the CSS grid layers move by different amounts.
 */
function useParallax(el: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = el.current;
    if (!node || prefersReducedMotion()) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;
      node.style.setProperty('--px', cur.x.toFixed(4));
      node.style.setProperty('--py', cur.y.toFixed(4));
      raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.0005 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: MouseEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      cancelAnimationFrame(raf);
    };
  }, [el]);
}

export default function Home() {
  const launch = useLaunch();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [typedOnce, setTypedOnce] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const typed = useTypedHint(!typedOnce);
  const hero = useRef<HTMLElement>(null);
  useParallax(hero);

  const catParam = params.get('cat') as Category | null;
  const cat = catParam && groups.some((g) => g.id === catParam) ? catParam : 'all';

  useEffect(() => {
    document.title = 'unktilz';
  }, []);

  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) input.current?.focus();
  }, [location.state]);

  const pick = (c: Category | 'all') => {
    const next = new URLSearchParams(params);
    if (c === 'all') next.delete('cat');
    else next.set('cat', c);
    setParams(next, { replace: true });
  };

  const shown = groups
    .filter((g) => cat === 'all' || g.id === cat)
    .map((g) => ({ ...g, tools: g.tools.filter((t) => matches(t, q)) }))
    .filter((g) => g.tools.length > 0);

  const chips = [{ id: 'all' as const, label: 'All', count: tools.length }, ...groups.map((g) => ({ id: g.id, label: g.label, count: g.tools.length }))];
  const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

  return (
    <>
      <section className="hero" ref={hero}>
        <div className="hero-inner">
          <div className="kicker">
            // {tools.length} tools · {groups.length} categories
          </div>
          <h1>Every tool you keep searching for.</h1>
          <p className="lede">Minecraft utilities, dev tools, file converters and everyday helpers, in one place.</p>
          <div className="search">
            <SearchIcon />
            <div className="search-field">
              <label htmlFor="q" className="sr-only">
                Search tools
              </label>
              <input
                id="q"
                ref={input}
                type="search"
                autoComplete="off"
                spellCheck={false}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setTypedOnce(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && shown[0]?.tools[0]) launch(null, shown[0].tools[0].slug);
                  if (e.key === 'Escape') setQ('');
                }}
              />
              {q === '' && (
                <span className="search-hint" aria-hidden="true">
                  {typedOnce ? (
                    'Search tools'
                  ) : (
                    <>
                      Search tools, try <span className="mono">{typed}</span>
                      <span className="caret" />
                    </>
                  )}
                </span>
              )}
            </div>
            <span className="kbd" aria-hidden="true">
              {isMac ? '⌘ K' : 'Ctrl K'}
            </span>
          </div>
        </div>
      </section>

      <div className="wrap home-main">
        <div className="chips" role="group" aria-label="Filter by category">
          {chips.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={c.id === cat} onClick={() => pick(c.id)}>
              <span>{c.label}</span>
              <span className="count">{c.count}</span>
            </button>
          ))}
        </div>

        {shown.map((g) => (
          <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
            <div className="group-head">
              <h2 id={`g-${g.id}`}>{CATEGORIES.find((c) => c.id === g.id)?.label}</h2>
              <span>{g.tools.length}</span>
            </div>
            <div className="tiles">
              {g.tools.map((t) => (
                <a key={t.slug} className="card" href={`/t/${t.slug}`} onClick={(e) => launch(e, t.slug)}>
                  <span className="card-name">{t.name}</span>
                  <span className="card-meta">{t.meta}</span>
                </a>
              ))}
            </div>
          </section>
        ))}

        {shown.length === 0 && (
          <div className="empty" role="status">
            No tool matches “{q}”.
          </div>
        )}
      </div>
    </>
  );
}
