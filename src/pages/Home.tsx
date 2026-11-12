import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { groups, isNew, tools, type Category, type Tool } from '../registry';
import { useLaunch } from '../components/Transition';
import { CategoryIcon, SearchIcon } from '../components/icons';
import { ToolTags } from '../components/ToolTags';
import { HeroBackground } from '../components/HeroBackground';
import { ShinyText } from '../components/bits/ShinyText';
import { openPalette } from '../components/CommandPalette';
import { preloadTool } from '../registry/preload';
import { prefersReducedMotion, spotlight, useCountUp, useDecrypt } from '../lib/motion';
import { plural, t } from '../lib/i18n-core';

/** One line under each category's heading. */
const ABOUT: Record<Category, string> = {
  minecraft: t('Commands, server tools, calculators, maps, skins and resource packs.'),
  dev: t('JSON, encoding, hashes and IDs.'),
  image: t('Convert, resize and crop pictures, remove backgrounds and make GIFs.'),
  color: t('Pick, mix and export colors, palettes and gradients.'),
  audio: t('Convert and cut sound, or make it sound bad.'),
  video: t('Convert and download videos, or make them look bad.'),
  pdf: t('Merge, split, organize, compress and convert PDFs.'),
  text: t('Helpers for working with text.'),
  calc: t('QR codes and other generators.'),
};

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

/** Filters by tag, under the categories. */
const TAGS = [
  { id: 'new', label: t('New'), has: (tt: Tool) => isNew(tt) },
  { id: 'beta', label: t('Beta'), has: (tt: Tool) => !!tt.beta },
] as const;
type Tag = (typeof TAGS)[number]['id'];
const isTag = (id: string): id is Tag => TAGS.some((tt) => tt.id === id);

const pickedIn = (p: URLSearchParams) => new Set((p.get('cat') ?? '').split(',').filter((c): c is Category => groups.some((g) => g.id === c)));
// A tag whose item isn't shown (no new tools left) doesn't filter either, or the page would be empty.
const tagsIn = (p: URLSearchParams) => new Set((p.get('tag') ?? '').split(',').filter((tt): tt is Tag => TAGS.some((x) => x.id === tt && tools.some(x.has))));

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

export default function Home() {
  const launch = useLaunch();
  const [params, setParams] = useSearchParams();
  const title = t('Every tool you keep searching for.');
  const shownTitle = useDecrypt(title);
  const toolCount = useCountUp(tools.length);
  const groupCount = useCountUp(groups.length, 900);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'unktilz';
  }, []);

  // Categories (?cat=pdf) and tags (?tag=new) in the address; none picked shows everything. Old
  // links with several (?cat=pdf,image) still show all of them.
  const picked = pickedIn(params);
  const pickedTags = tagsIn(params);
  const all = picked.size === 0 && pickedTags.size === 0;

  /** The side menu picks one category or tag; picking the one already shown goes back to all. */
  const choose = (id: Category | Tag | 'all') =>
    setParams(
      () => {
        const prev = new URLSearchParams(window.location.search);
        const next = new URLSearchParams(prev);
        const already = isTag(id) ? tagsIn(prev).has(id) && tagsIn(prev).size === 1 && pickedIn(prev).size === 0 : id !== 'all' && pickedIn(prev).has(id) && pickedIn(prev).size === 1 && tagsIn(prev).size === 0;
        next.delete('cat');
        next.delete('tag');
        if (id !== 'all' && !already) next.set(isTag(id) ? 'tag' : 'cat', id);
        return next;
      },
      { replace: true },
    );

  const tagged = (tt: Tool) => pickedTags.size === 0 || TAGS.some((tag) => pickedTags.has(tag.id) && tag.has(tt));
  const shown = groups
    .filter((g) => picked.size === 0 || picked.has(g.id))
    .map((g) => ({ ...g, tools: g.tools.filter(tagged) }))
    .filter((g) => g.tools.length > 0);

  const menu: { id: Category | Tag | 'all'; label: string; count: number; on: boolean; tag?: boolean }[] = [
    { id: 'all', label: t('All tools'), count: tools.length, on: all },
    ...groups.map((g) => ({ id: g.id, label: g.label, count: g.tools.length, on: picked.has(g.id) })),
    ...TAGS.map((tt) => ({ id: tt.id, label: tt.label, count: tools.filter(tt.has).length, on: pickedTags.has(tt.id), tag: true })).filter((x) => x.count > 0),
  ];

  // The highlight slides to the picked item (when exactly one is picked).
  const nav = useRef<HTMLElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null);
  const onCount = menu.filter((m) => m.on).length;
  const onId = onCount === 1 ? menu.find((m) => m.on)!.id : null;
  useLayoutEffect(() => {
    const el = onId ? nav.current?.querySelector<HTMLElement>(`[data-id="${onId}"]`) : null;
    setMark(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [onId]);

  const browse = () => {
    list.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  // Cards come in one after another, in page order across the groups.
  let cardIndex = 0;

  return (
    <>
      <section className="hero">
        <HeroBackground />
        <div className="hero-inner">
          <div className="kicker">
            <ShinyText>
              // {plural(toolCount, ['{n} tool', '{n} tools'], ['{n} nástroj', '{n} nástroje', '{n} nástrojů'])} · {plural(groupCount, ['{n} category', '{n} categories'], ['{n} kategorie', '{n} kategorie', '{n} kategorií'])}
            </ShinyText>
          </div>
          <h1 aria-label={title}>
            <span aria-hidden="true">{shownTitle}</span>
          </h1>
          <p className="lede">
            {t('Minecraft utilities, dev tools, file converters and everyday helpers, in one place. Everything runs right here in your browser, so your files never leave your computer.')}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary hero-find" onClick={openPalette}>
              <SearchIcon />
              {t('Search tools')}
              <span className="kbd" aria-hidden="true">
                {isMac ? '⌘ K' : 'Ctrl K' /* i18n-ignore */}
              </span>
            </button>
            <button type="button" className="btn" onClick={browse}>
              {t('Browse all')} <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
      </section>

      <div className="wrap home-layout" ref={list}>
        <nav className="cat-nav" aria-label={t('Categories and tags')} ref={nav}>
          {mark && <span className="cat-mark" style={{ transform: `translateY(${mark.top}px)`, height: mark.height }} aria-hidden="true" />}
          {menu.map((m, i) => (
            <div key={m.id} className="cat-row">
              {m.tag && !menu[i - 1]?.tag && <div className="cat-label">{t('Tags')}</div>}
              <button type="button" data-id={m.id} className={`cat-item${m.tag ? ` cat-tag cat-${m.id}` : ''}`} aria-pressed={m.on} onClick={() => choose(m.id)}>
                <span className="cat-icon" aria-hidden="true">
                  {m.id === 'all' ? <GridIcon /> : m.tag ? <span className="cat-dot" /> : <CategoryIcon category={m.id as Category} />}
                </span>
                <span className="cat-name">{m.label}</span>
                <span className="cat-count">{m.count}</span>
              </button>
            </div>
          ))}
        </nav>

        <div className="home-list">
          {shown.map((g) => (
            <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
              <div className="group-head">
                <span className="group-icon" aria-hidden="true">
                  <CategoryIcon category={g.id} />
                </span>
                <div className="group-text">
                  <h2 id={`g-${g.id}`}>
                    {g.label} <span className="group-count">{g.tools.length}</span>
                  </h2>
                  <p>{ABOUT[g.id]}</p>
                </div>
              </div>
              <div className="tiles" onPointerMove={spotlight}>
                {g.tools.map((tt) => (
                  <a
                    key={tt.slug}
                    className="card"
                    style={{ '--i': cardIndex++ } as React.CSSProperties}
                    href={`/t/${tt.slug}`}
                    onClick={(e) => launch(e, tt.slug)}
                    onMouseEnter={() => preloadTool(tt)}
                    onFocus={() => preloadTool(tt)}
                  >
                    <span className="card-glow" aria-hidden="true" />
                    <span className="card-top">
                      <span className="card-icon" aria-hidden="true">
                        <CategoryIcon category={tt.category} />
                      </span>
                      <span className="card-name">{tt.name}</span>
                      <span className="card-go" aria-hidden="true">
                        →
                      </span>
                    </span>
                    <span className="card-desc">{tt.description}</span>
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
              {t('No tool has all the picked filters.')}{' '}
              <button type="button" className="link-btn" onClick={() => choose('all')}>
                {t('Show all tools')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
