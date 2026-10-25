import { memo, useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Panel, Tabs, Toggle } from '../../../components/ui';
import { SearchIcon } from '../../../components/icons';
import { CATEGORIES, textureList, tintOf, type CategoryId, type TextureInfo } from '../../../lib/mc/pack/catalog';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { useTextureUrl } from './thumbs';
import { fmtNum, plural, t } from '../../../lib/i18n-core';

const Thumb = memo(function Thumb({
  info,
  bytes,
  changed,
  active,
  selected,
  onClick,
}: {
  info: TextureInfo;
  bytes: Uint8Array;
  changed: boolean;
  active: boolean;
  selected: boolean;
  onClick: (path: string, e: MouseEvent) => void;
}) {
  const url = useTextureUrl(bytes, tintOf(info.path));
  return (
    <button
      type="button"
      className={`rp-thumb${active ? ' active' : ''}${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      title={`${info.name}\n${info.path}`}
      onClick={(e) => onClick(info.path, e)}
    >
      <span className="rp-thumb-pic">{url && <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />}</span>
      <span className="rp-thumb-name">{info.name}</span>
      {changed && <span className="rp-dot" aria-label={t('(changed)')} />}
      {info.animated && (
        <span className="rp-anim" aria-label={t('(animated)')} title={t('animated')}>
          ▶
        </span>
      )}
    </button>
  );
});

/** Every texture of the version in tabs, with search; click opens one, Ctrl / Shift click picks several. */
export function TextureBrowser({
  vanilla,
  doc,
  active,
  selected,
  onOpen,
  onSelect,
}: {
  vanilla: Vanilla;
  doc: PackDoc;
  active: string | null;
  selected: string[];
  onOpen: (path: string) => void;
  onSelect: (paths: string[]) => void;
}) {
  const [cat, setCat] = useState<CategoryId>('block');
  const [query, setQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const all = useMemo(() => textureList(vanilla), [vanilla]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(
    () => all.filter((x) => (!onlyChanged || doc.textures[x.path]) && words.every((w) => x.search.includes(w))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, onlyChanged, doc.textures, query],
  );
  const searching = words.length > 0 || onlyChanged;
  const shown = searching ? matches : matches.filter((x) => x.cat === cat);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of matches) c[x.cat] = (c[x.cat] ?? 0) + 1;
    return c;
  }, [matches]);
  const sel = useMemo(() => new Set(selected), [selected]);

  const click = (path: string, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelect(sel.has(path) ? selected.filter((p) => p !== path) : [...selected, path]);
      return;
    }
    if (e.shiftKey && (selected.length || active)) {
      const from = shown.findIndex((x) => x.path === (selected[selected.length - 1] ?? active));
      const to = shown.findIndex((x) => x.path === path);
      if (from >= 0 && to >= 0) {
        const range = shown.slice(Math.min(from, to), Math.max(from, to) + 1).map((x) => x.path);
        onSelect([...new Set([...selected, ...range])]);
        return;
      }
    }
    onOpen(path);
  };

  // The same function for every thumbnail, so they only redraw when their own texture changes.
  const clickRef = useRef(click);
  clickRef.current = click;
  const onThumb = useCallback((path: string, e: MouseEvent) => clickRef.current(path, e), []);

  // Folder headings inside a tab (entity/chest, entity/cat…).
  let lastFolder = '';

  return (
    <Panel
      title={t('textures')}
      actions={
        <span className="muted mono" style={{ fontSize: 13 }}>
          {plural(Object.keys(doc.textures).length, ['{n} changed', '{n} changed'], ['{n} změněná', '{n} změněné', '{n} změněných'])}
        </span>
      }
    >
      <div className="rp-browse-bar">
        <label className="rp-search">
          <SearchIcon />
          <input className="input" type="search" placeholder={t('Search textures, e.g. diamond, oak log, creeper')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Search textures')} />
        </label>
        <span className="rp-only">
          <Toggle checked={onlyChanged} onChange={setOnlyChanged} label={t('Only changed')} />
          <span>{t('Only changed')}</span>
        </span>
      </div>
      {!searching && (
        <Tabs
          label={t('Texture kinds')}
          idPrefix="rp-cat"
          value={cat}
          onChange={setCat}
          tabs={CATEGORIES.map((c) => ({ id: c.id, label: `${t(c.label)} ${fmtNum(counts[c.id] ?? 0)}` }))}
        />
      )}
      {searching && <p className="note">{shown.length ? plural(shown.length, ['{n} texture found', '{n} textures found'], ['Nalezena {n} textura', 'Nalezeny {n} textury', 'Nalezeno {n} textur']) : t('Nothing found.')}</p>}
      <p className="note rp-hint">{t('Click a texture to edit it. Ctrl+click or Shift+click picks several, to change their colors together.')}</p>
      <div className="rp-grid" role="group" aria-label={t('Textures')}>
        {shown.map((x) => {
          const head = !searching && x.folder !== lastFolder && x.folder.includes('/') ? x.folder.split('/').slice(1).join('/') : null;
          lastFolder = x.folder;
          return (
            <FragmentWithHead key={x.path} head={head}>
              <Thumb info={x} bytes={doc.textures[x.path]?.png ?? vanilla.files[x.path]} changed={!!doc.textures[x.path]} active={x.path === active} selected={sel.has(x.path)} onClick={onThumb} />
            </FragmentWithHead>
          );
        })}
      </div>
    </Panel>
  );
}

function FragmentWithHead({ head, children }: { head: string | null; children: ReactNode }) {
  return (
    <>
      {head && <span className="rp-folder mono">{head}</span>}
      {children}
    </>
  );
}
