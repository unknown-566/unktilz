import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CATEGORIES, matches, tools, type Tool } from '../registry';
import { preloadTool } from '../registry/preload';
import { useLaunch } from './Transition';
import { SearchIcon } from './icons';
import { getLang, t } from '../lib/i18n-core';
import { switchLang } from '../lib/switchLang';
import { THEME_IDS, setTheme, themeName, useCustomThemes, useTheme, type ThemeChoice } from '../lib/theme';

/**
 * The Ctrl+K / ⌘K palette: one search box for every tool, the site's pages and a few actions
 * (theme, language). Opened with openPalette() from anywhere; the host is mounted once in App.
 */
let open = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const openPalette = () => {
  open = true;
  notify();
};
const closePalette = () => {
  open = false;
  notify();
};
export const togglePalette = () => (open ? closePalette() : openPalette());

type Item = { id: string; group: string; label: string; hint?: string; tool?: Tool; run: () => void };

/** Lower case without accents, like the tool search. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const hits = (text: string, q: string) => {
  const h = fold(text);
  return fold(q).split(/\s+/).every((w) => h.includes(w));
};

const MAX_TOOLS = 50;

export function CommandPaletteHost() {
  const shown = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (shown && !d.open) d.showModal();
    if (!shown && d.open) d.close();
  }, [shown]);

  return (
    <dialog
      ref={dialog}
      className="cmdk"
      aria-label={t('Search tools and pages')}
      onCancel={(e) => {
        e.preventDefault();
        closePalette();
      }}
      onClick={(e) => e.target === dialog.current && closePalette()}
    >
      {shown && <Palette />}
    </dialog>
  );
}

function Palette() {
  const launch = useLaunch();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const customs = useCustomThemes();
  const [, picked] = useTheme();
  const lang = getLang();

  const items = useMemo(() => {
    const go = (to: string) => () => {
      closePalette();
      launch(null, to);
    };
    const theme = (c: ThemeChoice) => () => {
      setTheme(c);
      closePalette();
    };
    const pages: Item[] = [
      { id: 'p:home', group: t('Pages'), label: t('All tools'), hint: '/', run: go('/') },
      { id: 'p:settings', group: t('Pages'), label: t('Settings'), hint: '/settings', run: go('/settings') },
      { id: 'p:changelog', group: t('Pages'), label: t('Changelog'), hint: '/changelog', run: go('/changelog') },
      { id: 'p:request', group: t('Pages'), label: t('Request a tool'), hint: '/request', run: go('/request') },
      { id: 'p:backup', group: t('Pages'), label: t('Backup'), hint: '/backup', run: go('/backup') },
    ];
    const actions: Item[] = [
      {
        id: 'a:lang',
        group: t('Actions'),
        // Spoken in the language it switches to, like the header button.
        label: lang === 'en' ? 'Přepnout do češtiny' : 'Switch to English', // i18n-ignore
        hint: lang === 'en' ? 'cs' : 'en', // i18n-ignore
        run: () => {
          closePalette();
          switchLang(lang === 'en' ? 'cs' : 'en');
        },
      },
      ...(['system', ...THEME_IDS] as const).map((id) => ({
        id: `a:theme:${id}`,
        group: t('Actions'),
        label: t('Theme: {name}', { name: themeName(id) }),
        hint: picked === id ? t('in use') : undefined,
        run: theme(id),
      })),
      ...customs.map((c) => ({
        id: `a:theme:custom:${c.id}`,
        group: t('Actions'),
        label: t('Theme: {name}', { name: c.name }),
        hint: picked === `custom:${c.id}` ? t('in use') : t('own'),
        run: theme(`custom:${c.id}`),
      })),
    ];
    const toolItem = (tt: Tool): Item => ({
      id: `t:${tt.slug}`,
      group: CATEGORIES.find((c) => c.id === tt.category)?.label ?? tt.category,
      label: tt.name,
      hint: tt.meta,
      tool: tt,
      run: go(`/t/${tt.slug}`),
    });

    const query = q.trim();
    if (!query) return [...pages, ...tools.map(toolItem)];
    // Typing: tools first (that's what people look for), then pages and actions.
    const found = tools.filter((tt) => matches(tt, query)).slice(0, MAX_TOOLS).map(toolItem);
    // Searching tools groups them as one list rather than per category.
    for (const it of found) it.group = t('Tools');
    return [...found, ...pages.filter((p) => hits(`${p.label} ${p.hint}`, query)), ...actions.filter((a) => hits(a.label, query))];
  }, [q, launch, customs, picked, lang]);

  // A new query starts from the top.
  useEffect(() => setSel(0), [q]);

  const current = items[Math.min(sel, items.length - 1)];
  // Fetch the picked tool's code while the user decides.
  useEffect(() => {
    if (!current?.tool) return;
    const timer = setTimeout(() => preloadTool(current.tool!), 150);
    return () => clearTimeout(timer);
  }, [current]);

  // Keep the picked row in view when moving with the keys.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const move = (d: number) => setSel((s) => (items.length ? (Math.min(s, items.length - 1) + d + items.length) % items.length : 0));

  let lastGroup = '';
  return (
    <div className="cmdk-body">
      <div className="cmdk-search">
        <SearchIcon />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={current ? `cmdk-${current.id}` : undefined}
          aria-label={t('Search tools and pages')}
          placeholder={t('Search tools and pages…')}
          spellCheck={false}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              move(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move(-1);
            } else if (e.key === 'Enter' && current) {
              e.preventDefault();
              current.run();
            }
          }}
        />
        <span className="kbd" aria-hidden="true">
          {/* i18n-ignore */}
          esc
        </span>
      </div>
      <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list} aria-label={t('Results')}>
        {items.length === 0 && (
          <div className="cmdk-empty" role="status">
            {t('Nothing matches “{q}”.', { q })}
          </div>
        )}
        {items.map((it, i) => {
          const head = it.group !== lastGroup;
          lastGroup = it.group;
          const on = it === current;
          return (
            <div key={it.id} role="presentation">
              {head && (
                <div className="cmdk-group" role="presentation">
                  {it.group}
                </div>
              )}
              <div
                id={`cmdk-${it.id}`}
                role="option"
                aria-selected={on}
                className="cmdk-item"
                onMouseMove={() => !on && setSel(i)}
                onClick={() => it.run()}
              >
                <span className="cmdk-label">{it.label}</span>
                {it.hint && <span className="cmdk-hint">{it.hint}</span>}
                <span className="cmdk-enter" aria-hidden="true">
                  ↵
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="cmdk-foot" aria-hidden="true">
        <span>
          <span className="kbd">↑↓</span> {t('move')}
        </span>
        <span>
          <span className="kbd">↵</span> {t('open')}
        </span>
        <span>
          <span className="kbd">{'esc' /* i18n-ignore */}</span> {t('close')}
        </span>
      </div>
    </div>
  );
}
