import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { CATEGORIES, groups, isNew, matches, tools, type Category, type Tool } from '../registry';
import { useLaunch } from '../components/Transition';
import { SearchIcon } from '../components/icons';
import { ToolTags } from '../components/ToolTags';
import { preloadTool } from '../registry/preload';
import { prefersReducedMotion } from '../lib/theme';
import { plural, t } from '../lib/i18n-core';

// Typed into the empty search box as examples (each finds a tool in its language).
const PHRASES = [t('server status'), t('ogg to mp3'), t('json formatter'), t('map art'), t('nether portal')];

/** The one typing animation on the site: example queries in the search placeholder. */
function useTypedHint(running: boolean) {
  const [state, setState] = useState({ pi: 0, ci: 0, del: false });
  useEffect(() => {
    if (!running) return;
    if (prefersReducedMotion()) {
      setState({ pi: 0, ci: PHRASES[0].length, del: false });
      return;
    }
    let tt: number;
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
      tt = window.setTimeout(step, next);
    };
    tt = window.setTimeout(step, 600);
    return () => clearTimeout(tt);
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

const NET = {
  required: { label: t('online'), title: t('Needs an internet connection: it asks an online service.') },
  partly: { label: t('partly online'), title: t('Works offline, but some features (like looking up a player) need an internet connection.') },
} as const;

/** Marks the few tools that use the internet; everything else is local. */
function NetTag({ level }: { level: 'required' | 'partly' }) {
  return (
    <span className={`net-tag net-${level}`} title={NET[level].title}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      {NET[level].label}
      <span className="sr-only"> — {NET[level].title}</span>
    </span>
  );
}

/** Filters by tag, next to the categories. */
const TAGS = [
  { id: 'new', label: t('New'), has: (tt: Tool) => isNew(tt) },
  { id: 'beta', label: t('Beta'), has: (tt: Tool) => !!tt.beta },
] as const;
type Tag = (typeof TAGS)[number]['id'];
type ChipId = Category | Tag;
const isTag = (id: string): id is Tag => TAGS.some((tt) => tt.id === id);

const pickedIn = (p: URLSearchParams) => new Set((p.get('cat') ?? '').split(',').filter((c): c is Category => groups.some((g) => g.id === c)));
// A tag whose chip isn't shown (no new tools left) doesn't filter either, or the page would be empty.
const tagsIn = (p: URLSearchParams) => new Set((p.get('tag') ?? '').split(',').filter((tt): tt is Tag => TAGS.some((x) => x.id === tt && tools.some(x.has))));

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
  const searchBox = useRef<HTMLDivElement>(null);

  // Once you start typing, bring the search box up to the top so the matches show right under it.
  const searching = q.trim() !== '';
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => searchBox.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }), 120);
    return () => clearTimeout(timer);
  }, [searching]);

  // The search field draws the same green block caret as the typing animation instead of the
  // browser's thin one: measure the text up to the caret and put the block there.
  const measure = useRef<HTMLSpanElement>(null);
  const [caret, setCaret] = useState<{ x: number; n: number; end: boolean } | null>(null);
  const placeCaret = () => {
    const el = input.current;
    const m = measure.current;
    if (!el || !m || document.activeElement !== el || el.selectionStart !== el.selectionEnd) return setCaret(null);
    m.textContent = el.value.slice(0, el.selectionStart ?? 0);
    // n changes on every move, which restarts the blink so the caret stays solid while typing.
    // At the end of the text it's the block, like the animation; inside the text a thin bar, so it
    // doesn't cover the letter after it.
    setCaret((c) => ({ x: m.offsetWidth - el.scrollLeft, n: (c?.n ?? 0) + 1, end: (el.selectionStart ?? 0) >= el.value.length }));
  };

  // Categories picked with the chips (?cat=pdf,image) and tags (?tag=new); none picked shows everything.
  const picked = pickedIn(params);
  const pickedTags = tagsIn(params);

  useEffect(() => {
    document.title = 'unktilz';
  }, []);

  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) input.current?.focus();
  }, [location.state]);

  /**
   * Changes the picked categories, starting from the address as it is now so quick clicks add up
   * (the router hands its updater the params of the last render, not the newest ones).
   */
  const updatePicked = (change: (cats: Set<string>, tags: Set<string>) => void) =>
    setParams(
      () => {
        const prev = new URLSearchParams(window.location.search);
        const cats: Set<string> = pickedIn(prev);
        const tags: Set<string> = tagsIn(prev);
        change(cats, tags);
        const next = new URLSearchParams(prev);
        // Kept in the page's order, so the address is the same whatever order they were clicked in.
        const put = (key: string, ids: string[], on: Set<string>) => {
          const list = ids.filter((id) => on.has(id));
          if (list.length) next.set(key, list.join(','));
          else next.delete(key);
        };
        put('cat', groups.map((g) => g.id), cats);
        put('tag', TAGS.map((tt) => tt.id), tags);
        return next;
      },
      { replace: true },
    );
  /** A chip switches its filter on; only its × switches it off again. "All" switches every one off. */
  const pick = (c: ChipId) => updatePicked((cats, tags) => void (isTag(c) ? tags : cats).add(c));
  const unpick = (c: ChipId) => updatePicked((cats, tags) => void (isTag(c) ? tags : cats).delete(c));
  const clearPicked = () =>
    updatePicked((cats, tags) => {
      cats.clear();
      tags.clear();
    });

  // Categories pick whole groups; tags then keep only the tools with one of the picked tags.
  const tagged = (tt: Tool) => pickedTags.size === 0 || TAGS.some((tag) => pickedTags.has(tag.id) && tag.has(tt));
  const shown = groups
    .filter((g) => picked.size === 0 || picked.has(g.id))
    .map((g) => ({ ...g, tools: g.tools.filter((tt) => tagged(tt) && matches(tt, q)) }))
    .filter((g) => g.tools.length > 0);

  // Enter opens the first match, so fetch its code while the user is still typing.
  const topMatch = q.trim() ? shown[0]?.tools[0] : undefined;
  useEffect(() => {
    if (!topMatch) return;
    const timer = setTimeout(() => preloadTool(topMatch), 250);
    return () => clearTimeout(timer);
  }, [topMatch]);

  const chips: { id: ChipId | 'all'; label: string; count: number; tag?: true }[] = [
    { id: 'all', label: t('All'), count: tools.length },
    ...groups.map((g) => ({ id: g.id, label: g.label, count: g.tools.length })),
    // A tag with no tools right now (nothing new this week) has no chip.
    ...TAGS.map((tt) => ({ id: tt.id, label: tt.label, count: tools.filter(tt.has).length, tag: true as const })).filter((c) => c.count > 0),
  ];
  const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

  return (
    <>
      <section className="hero" ref={hero}>
        <div className="hero-inner">
          <div className="kicker">
            // {plural(tools.length, ['{n} tool', '{n} tools'], ['{n} nástroj', '{n} nástroje', '{n} nástrojů'])} · {plural(groups.length, ['{n} category', '{n} categories'], ['{n} kategorie', '{n} kategorie', '{n} kategorií'])}
          </div>
          <h1>{t('Every tool you keep searching for.')}</h1>
          <p className="lede">
            {t('Minecraft utilities, dev tools, file converters and everyday helpers, in one place. Everything runs right here in your browser, so your files never leave your computer.')}
          </p>
          <div className="search" ref={searchBox}>
            <SearchIcon />
            <div className={`search-field${caret && q === '' ? ' caret-at-start' : ''}`}>
              <label htmlFor="q" className="sr-only">
                {t('Search tools')}
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
                  // The new text and caret position are already in the field: move the block now,
                  // not when the key comes back up.
                  placeCaret();
                }}
                onFocus={placeCaret}
                onBlur={() => setCaret(null)}
                onSelect={placeCaret}
                onKeyDownCapture={() => setTimeout(placeCaret, 0)}
                onScroll={placeCaret}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && shown[0]?.tools[0]) launch(null, shown[0].tools[0].slug);
                  if (e.key === 'Escape') setQ('');
                }}
              />
              {q === '' && (
                <span className="search-hint" aria-hidden="true">
                  {typedOnce ? (
                    t('Search tools')
                  ) : (
                    <>
                      {t('Search tools, try')} <span className="mono">{typed}</span>
                      {/* While the field has focus the real caret blinks instead, so there's only one. */}
                      {!caret && <span className="caret" />}
                    </>
                  )}
                </span>
              )}
              <span ref={measure} className="search-measure" aria-hidden="true" />
              {caret && <span key={caret.n} className={`caret search-caret${caret.end ? '' : ' bar'}`} style={{ left: caret.x }} aria-hidden="true" />}
            </div>
            <span className="kbd" aria-hidden="true">
              {isMac ? '⌘ K' : 'Ctrl K' /* i18n-ignore */}
            </span>
          </div>
        </div>
      </section>

      <div className={`wrap home-main${searching ? ' searching' : ''}`}>
        <div className="chips" role="group" aria-label={t('Show categories and tags (pick one or more)')}>
          {chips.map((c, i) => {
            const id = c.id;
            const on = id === 'all' ? picked.size === 0 && pickedTags.size === 0 : isTag(id) ? pickedTags.has(id) : picked.has(id);
            return (
              <span key={id} className={`chip-wrap${c.tag && !chips[i - 1]?.tag ? ' chip-tags-start' : ''}`}>
                <button type="button" className={`chip${c.tag ? ` chip-tag chip-${id}` : ''}`} aria-pressed={on} onClick={() => (id === 'all' ? clearPicked() : pick(id))}>
                  <span>{c.label}</span>
                  <span className="count">{c.count}</span>
                </button>
                {on && id !== 'all' && (
                  <button type="button" className="chip-x" aria-label={t('Stop showing only {label}', { label: c.label })} title={t('Unpick')} onClick={() => unpick(id)}>
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {shown.map((g) => (
          <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
            <div className="group-head">
              <h2 id={`g-${g.id}`}>{CATEGORIES.find((c) => c.id === g.id)?.label}</h2>
              <span>{g.tools.length}</span>
            </div>
            <div className="tiles">
              {g.tools.map((tt) => (
                <a key={tt.slug} className="card" href={`/t/${tt.slug}`} onClick={(e) => launch(e, tt.slug)} onMouseEnter={() => preloadTool(tt)} onFocus={() => preloadTool(tt)}>
                  <span className="card-name">{tt.name}</span>
                  <span className="card-foot">
                    <span className="card-meta">{tt.meta}</span>
                    <span className="card-tags">
                      <ToolTags tool={tt} />
                      {tt.online && <NetTag level={tt.online} />}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}

        {shown.length === 0 && (
          <div className="empty" role="status">
            {q.trim() ? t('No tool matches “{q}”.', { q }) : t('No tool has all the picked filters.')}
            {(picked.size > 0 || pickedTags.size > 0) && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={clearPicked}>
                  {t('Show all tools')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
