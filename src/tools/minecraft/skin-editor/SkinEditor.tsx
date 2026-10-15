import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Help } from '../../../components/Help';
import { Segmented, Toggle } from '../../../components/ui';
import { saveBlob } from '../../../queue/download';
import { PARTS, PART_LABEL, SKIN, convertArms, copyPart, texelAt, type Layer, type Model, type PartId, type Rect } from '../../../lib/mc/skinLayout';
import { copyRect, pasteClip, usedColors, type Clip } from '../../../lib/mc/skinOps';
import { SkinDoc, useDoc } from './doc';
import { fileBase, loadPlayer, loadSaved, save, type Loaded } from './load';
import type { Settings, ToolId } from './paint';
import { HistoryPanel, OpenSkin, PartTransfer, Row, Toolbox } from './Panels';
import type { ViewName } from './scene';
import { TextureView, type Float } from './TextureView';
import { Viewport3D } from './Viewport3D';

const SLOT = ['A', 'B'];
const NO_PARTS = new Set<PartId>();
const TOOL_KEYS: Record<string, ToolId> = { b: 'pencil', e: 'eraser', g: 'fill', s: 'shade', i: 'picker', m: 'select' };
// "Right" and "left" are the player's own sides.
const FACE_LABEL = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'right side', left: 'left side' } as const;

type Item = { part: PartId; layer: Layer };
type Clipboard = Clip & { x: number; y: number; from: string };

export default function SkinEditor() {
  const [slots, setSlots] = useState<(SkinDoc | null)[]>([null, null]);
  const [active, setActive] = useState(0);
  const [restored, setRestored] = useState(false);
  const [opening, setOpening] = useState(false);
  const [settings, setSettings] = useState<Settings>({ tool: 'pencil', color: '#3b82f6', size: 1, mirror: false, shadeDir: -1, layer: 'base' });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [showOverlay, setShowOverlay] = useState(true);
  const [hidden, setHidden] = useState<Set<PartId>>(NO_PARTS);
  const [view, setView] = useState<{ name: ViewName; n: number }>();
  const [hoverPx, setHoverPx] = useState<[number, number] | null>(null);
  const [highlight, setHighlight] = useState<Item[]>([]);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [float, setFloat] = useState<Float | null>(null);
  const [clip, setClip] = useState<Clipboard | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [params, setParams] = useSearchParams();

  const doc = slots[active];
  const other = slots[1 - active];
  useDoc(slots[0]);
  useDoc(slots[1]);

  const set = useCallback((s: Partial<Settings>) => setSettings((o) => ({ ...o, ...s })), []);
  const say = useCallback((m: string) => setMessage(m), []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 9000);
    return () => clearTimeout(t);
  }, [message]);

  // ---- open / restore ----
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const put = useCallback((slot: number, l: Loaded) => {
    const n = [...slotsRef.current];
    const d = n[slot];
    // Opening into a slot that holds a skin is one more undoable step there.
    if (d) d.replace(l.name, l.pixels, l.model, `Opened ${l.name}`);
    else n[slot] = new SkinDoc(l.name, l.pixels, l.model, `Opened ${l.name}`);
    slotsRef.current = n;
    setSlots(n);
    setActive(slot);
    setOpening(false);
    setSelection(null);
    setFloat(null);
    if (l.note) setMessage(l.note);
  }, []);

  useEffect(() => {
    let alive = true;
    loadSaved().then(async (saved) => {
      if (!alive) return;
      const docs = (saved?.slots ?? [null, null]).map((s) => (s ? new SkinDoc(s.name, s.pixels, s.model, 'Restored from last visit') : null));
      slotsRef.current = docs;
      setSlots(docs);
      setActive(saved?.active && docs[saved.active] ? saved.active : 0);
      setRecent(saved?.recent ?? []);
      setRestored(true);
      // Opened from the skin viewer: load that player into a free slot (or B).
      const player = params.get('player');
      if (player) {
        setParams({}, { replace: true });
        const slot = docs[0] ? 1 : 0;
        try {
          put(slot, await loadPlayer(player));
        } catch (err) {
          setMessage((err as Error).message);
        }
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save committed state a moment after changes (not mid-stroke, not an unplaced paste).
  const v0 = slots[0]?.index + ':' + slots[0]?.steps.length + slots[0]?.name;
  const v1 = slots[1]?.index + ':' + slots[1]?.steps.length + slots[1]?.name;
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      save({
        slots: slots.map((d) => (d ? { name: d.name, model: d.steps[d.index].model, pixels: d.steps[d.index].pixels } : null)),
        active,
        recent,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [restored, slots, active, recent, v0, v1]);

  // Colors you paint with go to "recent".
  const lastStep = useRef(0);
  useEffect(() => {
    if (!doc) return;
    const s = doc.steps[doc.index];
    if (s.id <= lastStep.current) return;
    lastStep.current = s.id;
    if (/^(Pencil|Fill)/.test(s.label)) setRecent((r) => [settings.color, ...r.filter((c) => c !== settings.color)].slice(0, 12));
  });

  // ---- paste ----
  const placeFloat = useCallback(
    (f: Float) => {
      if (!doc) return;
      doc.revert();
      pasteClip(doc.pixels, f, f.x, f.y);
      doc.touch();
      setFloat(f);
    },
    [doc],
  );
  const dropFloat = useCallback(() => {
    if (!doc || !float) return;
    doc.commit(`Pasted ${float.w}×${float.h}`);
    setFloat(null);
  }, [doc, float]);
  const cancelFloat = useCallback(() => {
    if (!doc || !float) return;
    doc.revert();
    setFloat(null);
  }, [doc, float]);

  const switchTo = (i: number) => {
    dropFloat();
    setSelection(null);
    setOpening(false);
    setActive(i);
  };

  const copy = () => {
    if (!doc || !selection) return false;
    setClip({ ...copyRect(doc.pixels, selection), x: selection.x, y: selection.y, from: SLOT[active] });
    say(`Copied ${selection.w}×${selection.h} pixels.${other ? ` Switch to ${SLOT[1 - active]} and press Ctrl+V to paste.` : ' Press Ctrl+V to paste.'}`);
    return true;
  };
  const paste = () => {
    if (!doc || !clip) return false;
    dropFloat();
    set({ tool: 'select' });
    setSelection(null);
    placeFloat({ w: clip.w, h: clip.h, data: clip.data, x: clip.x, y: clip.y });
    say('Drag the pasted pixels into place (or use the arrow keys), then press Enter. Esc cancels.');
    return true;
  };

  // ---- other actions ----
  const transfer = (items: Item[], from: number, to: number) => {
    const src = slots[from];
    const dst = slots[to];
    if (!src || !dst) return;
    dropFloat();
    for (const i of items) copyPart(src.steps[src.index].pixels, src.steps[src.index].model, dst.pixels, dst.model, i.part, i.layer);
    const names = items.map((i) => PART_LABEL[i.part][i.layer === 'base' ? 0 : 1].toLowerCase());
    dst.commit(`Copied ${names.length > 3 ? `${names.length} parts` : names.join(', ')} from ${SLOT[from]}`);
    setActive(to);
    say(`Copied to ${SLOT[to]}. Ctrl+Z undoes it.`);
  };

  const setModel = (m: Model) => {
    if (!doc || doc.model === m) return;
    dropFloat();
    doc.model = m;
    doc.commit(m === 'slim' ? 'Arms: slim' : 'Arms: classic');
  };
  const convertModel = () => {
    if (!doc) return;
    dropFloat();
    const to: Model = doc.model === 'slim' ? 'classic' : 'slim';
    doc.pixels.set(convertArms(doc.pixels, doc.model, to));
    doc.model = to;
    doc.commit(`Resized arms to ${to}`);
  };

  const download = () => {
    if (!doc) return;
    dropFloat();
    const c = document.createElement('canvas');
    c.width = c.height = SKIN;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(doc.pixels), SKIN, SKIN), 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      saveBlob(b, `${fileBase(doc.name)}.png`);
      doc.markSaved();
    }, 'image/png');
  };

  const close = (i: number) => {
    const d = slots[i];
    if (d?.dirty && !window.confirm(`Close ${SLOT[i]} (${d.name})? Changes you haven’t downloaded are lost.`)) return;
    if (i === active) {
      setFloat(null);
      setSelection(null);
    }
    setSlots((s) => s.map((x, j) => (j === i ? null : x)));
  };

  const undo = () => (float ? cancelFloat() : doc?.undo());
  const redo = () => !float && doc?.redo();

  const setTool = (t: ToolId) => {
    if (t !== 'select') {
      dropFloat();
      setSelection(null);
    }
    set({ tool: t });
  };

  // ---- keyboard ----
  const keys = useRef<(e: KeyboardEvent) => void>(undefined);
  keys.current = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let done = true;
    if (mod && k === 'z' && !e.shiftKey) undo();
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) redo();
    else if (mod && k === 'c') done = copy();
    else if (mod && k === 'v') done = paste();
    else if (mod || e.altKey) done = false;
    else if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
    else if (k === '[') set({ size: Math.max(1, settings.size - 1) });
    else if (k === ']') set({ size: Math.min(3, settings.size + 1) });
    else if (k === 'escape') float ? cancelFloat() : setSelection(null);
    else if (k === 'enter' && float) dropFloat();
    else if (float && k.startsWith('arrow')) {
      const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k] ?? [0, 0];
      placeFloat({ ...float, x: float.x + d[0], y: float.y + d[1] });
    } else done = false;
    if (done) e.preventDefault();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const used = useMemo(() => (doc ? usedColors(doc.steps[doc.index].pixels, 16) : []), [doc, doc?.index, doc?.steps.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlightParts = useMemo(() => [...new Set(highlight.map((h) => h.part))], [highlight]);
  const hoverInfo = useMemo(() => {
    if (!doc || !hoverPx) return '';
    const t = texelAt(doc.model, hoverPx[0], hoverPx[1]);
    if (!t) return `${hoverPx[0]}, ${hoverPx[1]} · not used by the game`;
    const { part, layer, face } = t.region;
    return `${PART_LABEL[part][layer === 'base' ? 0 : 1]} · ${FACE_LABEL[face]} · ${hoverPx[0]}, ${hoverPx[1]}`;
  }, [doc, hoverPx]);

  if (!restored) return <div className="panel muted mono">loading…</div>;

  const tabs = (
    <div className="sk-top">
      <div className="sk-tabs" role="group" aria-label="Open skins">
        {slots.map((d, i) => (
          <div key={i} className="sk-tab" data-active={i === active || undefined}>
            <button type="button" aria-pressed={i === active} onClick={() => switchTo(i)}>
              <b>{SLOT[i]}</b> <span>{d ? d.name : 'empty'}</span>
              {d?.dirty && <span className="tab-dot" aria-label="(not downloaded)"> ●</span>}
            </button>
            {d && (
              <button type="button" className="sk-tab-x" aria-label={`Close ${SLOT[i]}`} onClick={() => close(i)}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {doc && (
        <div className="sk-actions">
          <button type="button" className="btn btn-sm" onClick={undo} disabled={!float && !doc.canUndo} title="Undo (Ctrl+Z)">
            ↶ undo
          </button>
          <button type="button" className="btn btn-sm" onClick={redo} disabled={!!float || !doc.canRedo} title="Redo (Ctrl+Y)">
            ↷ redo
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setOpening(!opening)} aria-expanded={opening}>
            open…
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={download}>
            download .png
          </button>
        </div>
      )}
    </div>
  );

  if (!doc)
    return (
      <div className="sk">
        {tabs}
        <OpenSkin slot={SLOT[active]} onLoaded={(l) => put(active, l)} />
        {message && (
          <p className="note" role="status">
            {message}
          </p>
        )}
      </div>
    );

  return (
    <div className="sk">
      {tabs}
      {opening && <OpenSkin slot={SLOT[active]} onLoaded={(l) => put(active, l)} onCancel={() => setOpening(false)} />}
      <div className="sk-grid">
        <Toolbox settings={settings} set={(s) => (s.tool ? setTool(s.tool) : set(s))} recent={recent} used={used} />

        <section className="panel sk-stage" aria-label="3D view">
          <Viewport3D
            doc={doc}
            interactive
            settings={settingsRef}
            layer={settings.layer}
            showOverlay={showOverlay}
            hidden={hidden}
            highlight={highlightParts}
            hoverPx={hoverPx}
            onHover={setHoverPx}
            onPick={(c) => set({ color: c })}
            onMessage={say}
            view={view}
            label={`${doc.name} in 3D. Drag on the model to paint, drag beside it to turn it.`}
          />
          <div className="sk-status mono" aria-live="polite">
            {message ? <span className="sk-msg">{message}</span> : <span className="muted">{hoverInfo || 'Drag on the figure to paint · drag beside it (or right-drag) to turn · scroll to zoom'}</span>}
          </div>
          <div className="seg sk-views" role="group" aria-label="Camera">
            {(
              [
                ['angle', '3/4'],
                ['front', 'front'],
                ['back', 'back'],
                ['right', 'right side'],
                ['left', 'left side'],
              ] as const
            ).map(([name, label]) => (
              <button key={name} type="button" onClick={() => setView({ name, n: (view?.n ?? 0) + 1 })}>
                {label}
              </button>
            ))}
          </div>
          <hr className="divider" />
          <Row
            id="sk-layer"
            label="Paint on"
            help="Every part has two layers. Base is the body itself. Outer sits on top of it (hat, jacket, sleeves, pants) and can have see-through pixels. While you paint the base, the outer layer fades so you can see under it."
          >
            <Segmented
              labelledBy="sk-layer"
              value={settings.layer}
              onChange={(v) => set({ layer: v })}
              options={[
                { value: 'base', label: 'base' },
                { value: 'overlay', label: 'outer layer' },
              ]}
            />
          </Row>
          <Row id="sk-ov" label="Show outer layer">
            <Toggle labelledBy="sk-ov" checked={showOverlay || settings.layer === 'overlay'} onChange={setShowOverlay} />
          </Row>
          <Row id="sk-mirror" label="Mirror left ↔ right" help="Whatever you paint on one side also appears on the other: right arm ↔ left arm, and across the head and body.">
            <Toggle labelledBy="sk-mirror" checked={settings.mirror} onChange={(v) => set({ mirror: v })} />
          </Row>
          <Row
            id="sk-model"
            label="Arms"
            help="Classic (Steve) arms are 4 pixels wide, slim (Alex) arms 3. Pick what the skin was made for: if the arms look cut off or have a dark stripe, it's the other one. “resize arms” keeps how the arms look and changes the width."
          >
            <span className="inline" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Segmented
                labelledBy="sk-model"
                value={doc.model}
                onChange={setModel}
                options={[
                  { value: 'classic', label: 'classic' },
                  { value: 'slim', label: 'slim' },
                ]}
              />
              <button type="button" className="btn btn-sm" onClick={convertModel}>
                resize arms to {doc.model === 'slim' ? 'classic' : 'slim'}
              </button>
            </span>
          </Row>
          <div className="field">
            <span className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
              Show parts
              <Help label="Show parts" text="Hide parts to reach the ones behind them, e.g. hide the arms to paint the sides of the body." />
            </span>
            <div className="seg sk-chips">
              {PARTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={!hidden.has(p)}
                  onClick={() => {
                    const n = new Set(hidden);
                    if (n.has(p)) n.delete(p);
                    else n.add(p);
                    setHidden(n);
                  }}
                >
                  {PART_LABEL[p][0].toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="sk-side">
          <section className="panel" aria-label="Flat texture">
            <div className="opt-row">
              <h2 className="panel-title">// texture</h2>
              <Help label="Texture" text="The skin file itself, unfolded. You can paint here too. The darker hatched areas aren't used by the game. With Select (M) you can drag a box and copy it." />
            </div>
            <TextureView
              doc={doc}
              settings={settingsRef}
              hoverPx={hoverPx}
              onHover={setHoverPx}
              selection={selection}
              onSelection={setSelection}
              float={float}
              onFloatMove={(x, y) => float && placeFloat({ ...float, x, y })}
              onFloatDrop={dropFloat}
              highlight={highlight}
              onPick={(c) => set({ color: c })}
              onMessage={say}
            />
            {(settings.tool === 'select' || clip || float) && (
              <div className="seg" style={{ marginTop: 10 }}>
                {float ? (
                  <>
                    <button type="button" className="btn btn-sm btn-primary" onClick={dropFloat}>
                      place (Enter)
                    </button>
                    <button type="button" className="btn btn-sm" onClick={cancelFloat}>
                      cancel (Esc)
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-sm" onClick={copy} disabled={!selection}>
                      copy (Ctrl+C)
                    </button>
                    <button type="button" className="btn btn-sm" onClick={paste} disabled={!clip}>
                      paste{clip ? ` ${clip.w}×${clip.h} from ${clip.from}` : ''} (Ctrl+V)
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="panel" aria-label="Other skin">
            <div className="opt-row">
              <h2 className="panel-title">// {SLOT[1 - active]}{other ? ` · ${other.name}` : ''}</h2>
              <button type="button" className="btn btn-sm" onClick={() => switchTo(1 - active)}>
                {other ? 'edit this one' : 'open a second skin'}
              </button>
            </div>
            {other ? (
              <Viewport3D
                doc={other}
                interactive={false}
                layer="overlay"
                showOverlay
                hidden={NO_PARTS}
                highlight={highlightParts}
                onActivate={() => switchTo(1 - active)}
                label={`${other.name}, the other open skin. Click to edit it.`}
              />
            ) : (
              <p className="note">Open a second skin to copy a hat, a jacket or anything else between the two.</p>
            )}
          </section>

          <PartTransfer
            names={[slots[0]?.name ?? 'empty', slots[1]?.name ?? 'empty']}
            active={active}
            ready={!!other}
            onTransfer={transfer}
            onHighlight={setHighlight}
          />
          <HistoryPanel doc={doc} />

          <details className="panel sk-howto">
            <summary className="mono muted">how to wear it in the game</summary>
            <ol className="steps">
              <li>Download the .png.</li>
              <li>
                Go to <span className="mono">minecraft.net</span> → Profile → Skin (or the Skins tab in the launcher).
              </li>
              <li>
                Upload it and pick the same arm width as here: <b>{doc.model === 'slim' ? 'Slim' : 'Classic'}</b>.
              </li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
