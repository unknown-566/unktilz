import { useEffect, useMemo, useRef, useState } from 'react';
import { FONT_CATS, FONT_LIST, drawWeights, fontCss, fontInfo, type FontCat, type FontInfo } from './fontList';
import { loadFont, loadPreviewFont, previewName } from './fontLoad';

const PAGE = 80;
type Filter = 'all' | 'offline' | FontCat;

/** One font in the list, its name written in it once that's loaded (only when scrolled into view). */
function FontRow({ font, selected, onPick }: { font: FontInfo; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>(font.source === 'system' ? 'ready' : 'idle');
  useEffect(() => {
    if (state !== 'idle' || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((e) => e.isIntersecting)) return;
      io.disconnect();
      loadPreviewFont(font.family).then(
        () => alive && setState('ready'),
        () => alive && setState('failed'),
      );
    });
    io.observe(ref.current);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [font.family, state]);
  const family = font.source === 'google' ? `"${previewName(font.family)}", ${fontCss(font.family)}` : fontCss(font.family);
  return (
    <button ref={ref} type="button" role="option" aria-selected={selected} className="gm-font-row" onClick={onPick}>
      <span className={`gm-font-name${state === 'ready' ? '' : ' loading'}`} style={{ fontFamily: family, fontWeight: drawWeights(font.family)[0] }}>
        {font.family}
      </span>
      <span className="gm-font-tags mono">
        {font.source !== 'google' && <span className="gm-font-tag">{font.source}</span>}
        {!font.czech && <span className="gm-font-tag warn" title="Letters like č, ř, ž show in a plain font">no Czech letters</span>}
      </span>
    </button>
  );
}

/** Picks a font for a text: the ten offline ones, the computer's, or any Google font. */
export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState<{ font: string; error?: string; ready?: boolean }>({ font: value });
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // The chosen font itself (all its letters), so the button and the GIF show it.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus({ font: value });
    loadFont(value).then(
      () => alive && setStatus({ font: value, ready: true }),
      (e: Error) => alive && setStatus({ font: value, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [value, attempt]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return FONT_LIST.filter((f) => (filter === 'all' || (filter === 'offline' ? f.source !== 'google' : f.cat === filter)) && words.every((w) => f.family.toLowerCase().includes(w)));
  }, [q, filter]);

  const info = fontInfo(value);
  const pick = (family: string) => {
    onChange(family);
    setOpen(false);
  };

  return (
    <div className="gm-font" ref={box} onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), setOpen(false))}>
      <button type="button" className="select gm-font-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ fontFamily: fontCss(value), fontWeight: drawWeights(value)[0] }}>{value}</span>
      </button>
      {status.font === value && status.error ? (
        <p className="note give-warn">
          This font couldn’t be loaded ({status.error}), so the text uses a plain font for now.{' '}
          <button type="button" className="btn btn-sm" onClick={() => setAttempt(attempt + 1)}>
            try again
          </button>
        </p>
      ) : (
        info?.source === 'google' && !status.ready && <p className="note mono">loading the font…</p>
      )}
      {open && (
        <div className="gm-font-panel">
          <input
            ref={search}
            className="input"
            type="search"
            placeholder={`search ${FONT_LIST.length} fonts…`}
            aria-label="Search fonts"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
          />
          <div className="chips-row" role="group" aria-label="Font kinds">
            {([['all', 'All'], ['offline', 'Offline'], ...FONT_CATS.map((c) => [c.value, c.label])] as [Filter, string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={filter === v}
                onClick={() => {
                  setFilter(v);
                  setShown(PAGE);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="gm-font-list" role="listbox" aria-label="Fonts">
            {list.slice(0, shown).map((f) => (
              <FontRow key={f.family} font={f} selected={f.family === value} onPick={() => pick(f.family)} />
            ))}
            {!list.length && <p className="note">No font called “{q}”.</p>}
            {list.length > shown && (
              <button type="button" className="btn btn-sm gm-font-more" onClick={() => setShown(shown + PAGE)}>
                show more ({list.length - shown})
              </button>
            )}
          </div>
          <p className="note">
            “Offline” fonts come with the site and work without the internet. The others are from{' '}
            <a href="https://fonts.google.com" target="_blank" rel="noreferrer">
              Google Fonts
            </a>{' '}
            (free to use) and load when you pick one.
          </p>
        </div>
      )}
    </div>
  );
}
