import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { SavedItem } from '../../../lib/saved';
import { Segmented } from '../../../components/ui';
import type { StickerRef } from './compose';
import { NOTO, NOTO_CATEGORIES, notoUrl, type MySticker } from './stickerData';
import { t, tn, tx } from '../../../lib/i18n';

const SHORT = [tx('Smileys'), tx('People'), tx('Animals'), tx('Food'), tx('Travel'), tx('Activities'), tx('Objects'), tx('Symbols'), tx('Flags')];
const PAGE = 120;
const ACCEPT = '.png,.gif,.webp,.apng,image/png,image/gif,image/webp';

/**
 * One emoji: the still emoji from the system, and the animated one only while it's hovered. Each
 * animated one is a 512 px animation, so leaving them all playing after the mouse passed made the
 * list crawl.
 */
function EmojiCell({ code, char, name, onPick }: { code: string; char: string; name: string; onPick: () => void }) {
  const [live, setLive] = useState(false);
  // Only once the mouse stays a moment: sweeping across the grid shouldn't start dozens of downloads.
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (on: boolean) => {
    clearTimeout(timer.current);
    if (on) timer.current = window.setTimeout(() => setLive(true), 150);
    else setLive(false);
  };
  return (
    <button
      type="button"
      className="gm-sticker-cell"
      title={name}
      aria-label={t('Add {name}', { name })}
      onClick={onPick}
      onPointerEnter={() => show(true)}
      onPointerLeave={() => show(false)}
      onFocus={() => show(true)}
      onBlur={() => show(false)}
    >
      <span aria-hidden="true">{char}</span>
      {live && <img src={notoUrl(code)} alt="" draggable={false} onError={(e) => (e.currentTarget.style.display = 'none')} />}
    </button>
  );
}

export function StickerPicker({
  onAdd,
  mine,
  mineUrls,
  onUpload,
  onRemoveMine,
  uploadError,
}: {
  onAdd: (ref: StickerRef, name: string) => void;
  mine: SavedItem<MySticker>[];
  mineUrls: Map<string, string>;
  onUpload: (files: File[]) => void;
  onRemoveMine: (id: string) => void;
  uploadError: string;
}) {
  const [tab, setTab] = useState<'emoji' | 'mine'>('emoji');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(-1);
  const [shown, setShown] = useState(PAGE);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return NOTO.filter(
      (e) => (cat < 0 || e.cat === cat) && words.every((w) => e.char === w || e.name.includes(w) || e.also.some((a) => a.includes(w)) || NOTO_CATEGORIES[e.cat].toLowerCase().includes(w)),
    );
  }, [q, cat]);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onUpload([...e.dataTransfer.files]);
  };

  return (
    <>
      <Segmented
        label={t('Stickers')}
        value={tab}
        options={[
          { value: 'emoji', label: t('animated emoji') },
          { value: 'mine', label: mine.length ? t('my stickers · {n}', { n: mine.length }) : t('my stickers') },
        ]}
        onChange={setTab}
      />
      {tab === 'emoji' ? (
        <>
          <input
            className="input"
            type="search"
            placeholder={t('search: cat, fire, heart, laugh…')}
            aria-label={t('Search emoji')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
          />
          <div className="chips-row" role="group" aria-label={t('Emoji groups')}>
            <button type="button" className="chip" aria-pressed={cat < 0} onClick={() => setCat(-1)}>
              {t('All')}
            </button>
            {SHORT.slice(0, NOTO_CATEGORIES.length).map((label, i) => (
              <button key={label} type="button" className="chip" aria-pressed={cat === i} onClick={() => setCat(cat === i ? -1 : i)}>
                {t(label)}
              </button>
            ))}
          </div>
          {list.length ? (
            <div className="gm-sticker-grid">
              {list.slice(0, shown).map((e) => (
                <EmojiCell key={e.code} code={e.code} char={e.char} name={e.name} onPick={() => onAdd({ type: 'noto', code: e.code }, e.name)} />
              ))}
            </div>
          ) : (
            <p className="note">{t('No emoji for “{q}”.', { q })}</p>
          )}
          {list.length > shown && (
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShown(shown + PAGE)}>
              {t('show more ({n})', { n: list.length - shown })}
            </button>
          )}
          <p className="note">
            {tn('Hover an emoji to see it move. Needs the internet. Artwork: {noto} by Google, {license}.', {
              noto: (
                <a href="https://googlefonts.github.io/noto-emoji-animation/" target="_blank" rel="noreferrer">
                  Noto Emoji Animation
                </a>
              ),
              license: (
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                  CC BY 4.0
                </a>
              ),
            })}
          </p>
        </>
      ) : (
        <>
          <div
            className={`drop gm-sticker-drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
            onDrop={drop}
          >
            <div className="drop-title">{t('Drop a sticker here')}</div>
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
              {t('Choose a sticker')}
            </button>
            <div className="drop-sub">{t('png · gif · webp, see-through and animated ones too')}</div>
            <input
              ref={file}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(e) => {
                onUpload([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </div>
          {uploadError && (
            <p className="note give-warn" role="alert">
              {uploadError}
            </p>
          )}
          {mine.length ? (
            <div className="gm-sticker-grid">
              {mine.map((m) => (
                <div key={m.id} className="gm-mine">
                  <button type="button" className="gm-sticker-cell" title={m.name} aria-label={t('Add {name}', { name: m.name })} onClick={() => onAdd({ type: 'mine', id: m.id }, m.name)}>
                    {mineUrls.get(m.id) && <img src={mineUrls.get(m.id)} alt="" draggable={false} />}
                  </button>
                  <button type="button" className="gm-mine-x" aria-label={t('Delete {name} from my stickers', { name: m.name })} onClick={() => onRemoveMine(m.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="note">{t('Stickers you add are kept in this browser (and in Backup). Tip: on Giphy, open a sticker and save it as a .gif or .webp.')}</p>
          )}
        </>
      )}
    </>
  );
}
