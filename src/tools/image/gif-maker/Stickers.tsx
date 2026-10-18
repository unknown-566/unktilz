import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { SavedItem } from '../../../lib/saved';
import { Segmented } from '../../../components/ui';
import type { StickerRef } from './compose';
import { NOTO, NOTO_CATEGORIES, notoUrl, type MySticker } from './stickerData';

const SHORT = ['Smileys', 'People', 'Animals', 'Food', 'Travel', 'Activities', 'Objects', 'Symbols', 'Flags'];
const PAGE = 120;
const ACCEPT = '.png,.gif,.webp,.apng,image/png,image/gif,image/webp';

/** One emoji: the still emoji from the system right away, the animated one while hovered. */
function EmojiCell({ code, char, name, onPick }: { code: string; char: string; name: string; onPick: () => void }) {
  const [live, setLive] = useState(false);
  return (
    <button type="button" className="gm-sticker-cell" title={name} aria-label={`Add ${name}`} onClick={onPick} onPointerEnter={() => setLive(true)} onFocus={() => setLive(true)}>
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
        label="Stickers"
        value={tab}
        options={[
          { value: 'emoji', label: 'animated emoji' },
          { value: 'mine', label: `my stickers${mine.length ? ` · ${mine.length}` : ''}` },
        ]}
        onChange={setTab}
      />
      {tab === 'emoji' ? (
        <>
          <input
            className="input"
            type="search"
            placeholder="search: cat, fire, heart, laugh…"
            aria-label="Search emoji"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
          />
          <div className="chips-row" role="group" aria-label="Emoji groups">
            <button type="button" className="chip" aria-pressed={cat < 0} onClick={() => setCat(-1)}>
              All
            </button>
            {SHORT.slice(0, NOTO_CATEGORIES.length).map((label, i) => (
              <button key={label} type="button" className="chip" aria-pressed={cat === i} onClick={() => setCat(cat === i ? -1 : i)}>
                {label}
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
            <p className="note">No emoji for “{q}”.</p>
          )}
          {list.length > shown && (
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShown(shown + PAGE)}>
              show more ({list.length - shown})
            </button>
          )}
          <p className="note">
            Hover an emoji to see it move. Needs the internet. Artwork:{' '}
            <a href="https://googlefonts.github.io/noto-emoji-animation/" target="_blank" rel="noreferrer">
              Noto Emoji Animation
            </a>{' '}
            by Google,{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            .
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
            <div className="drop-title">Drop a sticker here</div>
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
              Choose a sticker
            </button>
            <div className="drop-sub">png · gif · webp, see-through and animated ones too</div>
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
                  <button type="button" className="gm-sticker-cell" title={m.name} aria-label={`Add ${m.name}`} onClick={() => onAdd({ type: 'mine', id: m.id }, m.name)}>
                    {mineUrls.get(m.id) && <img src={mineUrls.get(m.id)} alt="" draggable={false} />}
                  </button>
                  <button type="button" className="gm-mine-x" aria-label={`Delete ${m.name} from my stickers`} onClick={() => onRemoveMine(m.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="note">Stickers you add are kept in this browser (and in Backup). Tip: on Giphy, open a sticker and save it as a .gif or .webp.</p>
          )}
        </>
      )}
    </>
  );
}
