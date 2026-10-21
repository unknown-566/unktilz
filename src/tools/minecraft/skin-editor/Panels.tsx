import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Help } from '../../../components/Help';
import { UploadIcon } from '../../../components/icons';
import { Segmented } from '../../../components/ui';
import { PARTS, PART_LABEL, type Layer, type PartId } from '../../../lib/mc/skinLayout';
import { blankSkin } from '../../../lib/mc/skinOps';
import { isName } from '../../../lib/mc/uuid';
import { useDoc, type SkinDoc } from './doc';
import { decodeSkin, loadPlayer, type Loaded } from './load';
import type { Settings, ToolId } from './paint';
import { plural, t } from '../../../lib/i18n-core';

export function Row({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="opt-row">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className="opt-label" id={id}>
          {label}
        </span>
        {help && <Help label={label} text={help} />}
      </span>
      {children}
    </div>
  );
}

/** Open a skin from a file, a player name, or start from a blank figure. */
export function OpenSkin({ slot, onLoaded, onCancel }: { slot: string; onLoaded: (l: Loaded) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nameId = useId();

  const run = async (fn: () => Promise<Loaded>) => {
    setBusy(true);
    setError('');
    try {
      onLoaded(await fn());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const file = (f?: File) => f && run(() => decodeSkin(f, f.name.replace(/\.[^.]+$/, '')));
  const player = (e: FormEvent) => {
    e.preventDefault();
    if (isName(name)) run(() => loadPlayer(name));
  };

  return (
    <section className="panel sk-open" aria-label={t('Open a skin in slot {slot}', { slot })}>
      <div className="opt-row">
        <h2 className="panel-title">{t('// open a skin in slot {slot}', { slot })}</h2>
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {t('cancel')}
          </button>
        )}
      </div>
      <div className="sk-open-grid">
        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setOver(false);
            file(e.dataTransfer.files[0]);
          }}
        >
          <span className="accent">
            <UploadIcon />
          </span>
          <div className="drop-title">{t('Drop a skin .png here')}</div>
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>
            {t('Choose a file')}
          </button>
          <input ref={input} type="file" accept="image/png,image/*" hidden onChange={(e) => file(e.target.files?.[0])} />
        </div>
        <div className="sk-open-side">
          <form onSubmit={player} className="field">
            <label htmlFor={nameId}>{t('…or a player’s current skin')}</label>
            <div className="inline">
              <input id={nameId} className="input mono" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('jeb_')} spellCheck={false} autoComplete="off" />
              <button type="submit" className="btn" disabled={busy || !isName(name)}>
                {busy ? t('loading…') : t('load')}
              </button>
            </div>
          </form>
          <div className="field">
            <span className="field-label">{t('…or start from scratch')}</span>
            <div className="seg">
              <button type="button" className="btn" disabled={busy} onClick={() => onLoaded({ name: 'my_skin', pixels: blankSkin('classic'), model: 'classic' })}>
                {t('blank figure')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => onLoaded({ name: 'my_skin', pixels: blankSkin('slim'), model: 'slim' })}>
                {t('blank, slim arms')}
              </button>
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p className="drop-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const TOOLS: { id: ToolId; label: string; key: string; help: string }[] = [
  { id: 'pencil', label: t('Pencil'), key: 'B', help: t('Paints pixels in the chosen color. Drag to draw.') },
  { id: 'eraser', label: t('Eraser'), key: 'E', help: t('Makes outer-layer pixels see-through. The base layer can’t be erased (the game would show black), paint over it instead.') },
  { id: 'fill', label: t('Fill'), key: 'G', help: t('Fills a patch of one color. It stays on the side of the box you click, so it never runs onto the next face.') },
  { id: 'shade', label: t('Shade'), key: 'S', help: t('Makes pixels a bit lighter or darker each time you go over them. Great for shadows and folds. Hold Shift for the opposite.') },
  { id: 'picker', label: t('Picker'), key: 'I', help: t('Click a pixel to use its color. You can also Alt + click with any tool.') },
  { id: 'select', label: t('Select'), key: 'M', help: t('Drag a box on the flat texture, then Ctrl+C. Switch to the other skin and Ctrl+V, drag it into place and press Enter.') },
];

const ICON_PATHS: Record<ToolId, ReactNode> = {
  pencil: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </>
  ),
  eraser: (
    <>
      <path d="M8 20h12" />
      <path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8l-3.5-3.5z" />
      <path d="M9 11l5 5" />
    </>
  ),
  fill: (
    <>
      <path d="M5 11l6-6 7 7-6 6a2 2 0 01-2.8 0L5 13.8a2 2 0 010-2.8z" />
      <path d="M8 3l3 2" />
      <path d="M5 12h13" />
      <path d="M20 15s1.5 2 1.5 3a1.5 1.5 0 01-3 0c0-1 1.5-3 1.5-3z" />
    </>
  ),
  shade: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 010 16z" fill="currentColor" />
    </>
  ),
  picker: (
    <>
      <path d="M14.5 4.5a2.1 2.1 0 013 3L16 9l-1 1-3-3 1-1 1.5-1.5z" />
      <path d="M12 7l5 5" />
      <path d="M13.5 8.5L6 16l-1 3 3-1 7.5-7.5" />
    </>
  ),
  select: (
    <>
      <path d="M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4" />
    </>
  ),
};

function ToolIcon({ tool }: { tool: ToolId }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[tool]}
    </svg>
  );
}

export function Toolbox({
  settings,
  set,
  recent,
  used,
}: {
  settings: Settings;
  set: (s: Partial<Settings>) => void;
  recent: string[];
  used: string[];
}) {
  const colorId = useId();
  const [hex, setHex] = useState(settings.color);
  useEffect(() => setHex(settings.color), [settings.color]);
  const swatches = (list: string[], label: string) =>
    list.length > 0 && (
      <div className="field">
        <span className="field-label">{label}</span>
        <div className="sk-swatches">
          {list.map((c) => (
            <button
              key={c}
              type="button"
              className="sk-swatch"
              style={{ background: c }}
              aria-label={c}
              title={c}
              aria-pressed={c === settings.color}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
      </div>
    );
  return (
    <section className="panel sk-tools" aria-label={t('Tools')}>
      <h2 className="panel-title">{t('// tools')}</h2>
      <div className="sk-toolgrid" role="group" aria-label={t('Tool')}>
        {TOOLS.map((tt) => (
          <button key={tt.id} type="button" className="sk-tool" aria-pressed={settings.tool === tt.id} title={`${tt.label} (${tt.key})`} onClick={() => set({ tool: tt.id })}>
            <ToolIcon tool={tt.id} />
            <span>{tt.label}</span>
          </button>
        ))}
      </div>
      {(() => {
        const tt = TOOLS.find((x) => x.id === settings.tool)!;
        return (
          <p className="note sk-toolhelp">
            <b>{tt.label}</b> <kbd className="sk-kbd">{tt.key}</kbd> {tt.help}
          </p>
        );
      })()}

      {(settings.tool === 'pencil' || settings.tool === 'eraser' || settings.tool === 'shade') && (
        <Row id="sk-size" label={t('Brush size')} help={t('How many pixels wide the brush is. Keys [ and ].')}>
          <Segmented
            labelledBy="sk-size"
            compact
            value={String(settings.size)}
            onChange={(v) => set({ size: Number(v) })}
            options={['1', '2', '3'].map((v) => ({ value: v, label: v }))}
          />
        </Row>
      )}
      {settings.tool === 'shade' && (
        <Row id="sk-shade" label={t('Shade')}>
          <Segmented
            labelledBy="sk-shade"
            value={settings.shadeDir > 0 ? 'light' : 'dark'}
            onChange={(v) => set({ shadeDir: v === 'light' ? 1 : -1 })}
            options={[
              { value: 'dark', label: t('darker') },
              { value: 'light', label: t('lighter') },
            ]}
          />
        </Row>
      )}

      <div className="field">
        <label htmlFor={colorId}>{t('Color')}</label>
        <div className="inline sk-color">
          <input id={colorId} type="color" value={settings.color} onChange={(e) => set({ color: e.target.value })} />
          <input
            className="input mono"
            aria-label={t('Color as hex')}
            value={hex}
            maxLength={7}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
              setHex(v);
              if (/^#[0-9a-f]{6}$/i.test(v)) set({ color: v.toLowerCase() });
            }}
          />
        </div>
      </div>
      {swatches(recent, t('Recent'))}
      {swatches(used, t('In this skin'))}
    </section>
  );
}

type Item = { part: PartId; layer: Layer };
const key = (i: Item) => `${i.part}:${i.layer}`;

/** Copy whole parts (or just their outer layer) from one skin to the other. */
export function PartTransfer({
  names,
  active,
  ready,
  onTransfer,
  onHighlight,
}: {
  names: [string, string];
  active: number;
  ready: boolean;
  onTransfer: (items: Item[], from: number, to: number) => void;
  onHighlight: (items: Item[]) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(['head:overlay']));
  const [toActive, setToActive] = useState(true);
  const from = toActive ? 1 - active : active;
  const to = 1 - from;
  const items: Item[] = PARTS.flatMap((part) => (['base', 'overlay'] as Layer[]).map((layer) => ({ part, layer }))).filter((i) => checked.has(key(i)));
  const toggle = (i: Item) => {
    const n = new Set(checked);
    if (n.has(key(i))) n.delete(key(i));
    else n.add(key(i));
    setChecked(n);
  };
  const preset = (pick: (i: Item) => boolean) => setChecked(new Set(PARTS.flatMap((part) => (['base', 'overlay'] as Layer[]).map((layer) => ({ part, layer }))).filter(pick).map(key)));
  const slot = (i: number) => `${i ? 'B' : 'A'} (${names[i]})`;

  return (
    <section className="panel" aria-label={t('Copy parts between skins')}>
      <div className="opt-row">
        <h2 className="panel-title">{t('// copy parts')}</h2>
        <Help
          label={t('Copy parts')}
          text={t('Takes whole parts from one skin and puts them on the other, e.g. a hat or a jacket. Base is the part itself, outer is the layer on top (hat, jacket, sleeves, pants). Slim and classic arms are resized to fit. You can undo it.')}
        />
      </div>
      {!ready ? (
        <p className="note">{t('Open a second skin (tab B) to copy parts between the two.')}</p>
      ) : (
        <>
          <div className="opt-row">
            <span className="mono sk-dir">
              {slot(from)} → {slot(to)}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setToActive(!toActive)} aria-label={t('Swap direction')}>
              {t('⇄ swap')}
            </button>
          </div>
          <div className="sk-parts" onMouseLeave={() => onHighlight([])}>
            <span />
            <span className="mono muted">{t('base')}</span>
            <span className="mono muted">{t('outer')}</span>
            {PARTS.map((part) => (
              <div key={part} className="sk-part-row" onMouseEnter={() => onHighlight([{ part, layer: 'base' }, { part, layer: 'overlay' }])}>
                <span>{PART_LABEL[part][0]}</span>
                {(['base', 'overlay'] as Layer[]).map((layer) => (
                  <label key={layer} className="sk-check" title={PART_LABEL[part][layer === 'base' ? 0 : 1]}>
                    <input type="checkbox" checked={checked.has(key({ part, layer }))} onChange={() => toggle({ part, layer })} />
                    <span className="sr-only">{PART_LABEL[part][layer === 'base' ? 0 : 1]}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="seg" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-sm" onClick={() => preset(() => true)}>
              {t('everything')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => preset((i) => i.layer === 'overlay')}>
              {t('outer layer only')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => preset(() => false)}>
              {t('none')}
            </button>
          </div>
          <button type="button" className="btn btn-primary sk-wide" disabled={!items.length} onClick={() => onTransfer(items, from, to)}>
            {items.length
              ? plural(items.length, ['Copy {n} part to {slot}', 'Copy {n} parts to {slot}'], ['Přenést {n} část do {slot}', 'Přenést {n} části do {slot}', 'Přenést {n} částí do {slot}'], { slot: to ? 'B' : 'A' })
              : t('Copy parts to {slot}', { slot: to ? 'B' : 'A' })}
          </button>
        </>
      )}
    </section>
  );
}

export function HistoryPanel({ doc }: { doc: SkinDoc }) {
  useDoc(doc);
  const list = useRef<HTMLOListElement>(null);
  // Keep the current step in view by scrolling the list itself only. scrollIntoView would also
  // scroll the page, which made everything jump while painting.
  useEffect(() => {
    const ol = list.current;
    const cur = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !cur) return;
    const top = cur.offsetTop; // the list is position: relative, so this is inside it
    if (top < ol.scrollTop) ol.scrollTop = top;
    else if (top + cur.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTop = top + cur.offsetHeight - ol.clientHeight;
  }, [doc.index, doc.steps.length]);
  return (
    <section className="panel" aria-label={t('History')}>
      <div className="opt-row">
        <h2 className="panel-title">{t('// history')}</h2>
        <Help label={t('History')} text={t('Every change is a step. Click a step to go back to how the skin looked then; Ctrl+Z / Ctrl+Y step back and forward. Steps after the current one are kept until you change something new.')} />
      </div>
      <ol className="sk-history" ref={list}>
        {doc.steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={i === doc.index ? 'step' : undefined}
              className={i > doc.index ? 'future' : undefined}
              onClick={() => doc.goto(i)}
            >
              <span className="mono muted">{i + 1}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
