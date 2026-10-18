import type { ReactNode } from 'react';
import { Help } from '../../../components/Help';
import { Segmented, Toggle } from '../../../components/ui';
import { type Layer, type LayerAnim, type StickerLayer, type StickerRef, type TextLayer, type TextStyle } from './compose';
import { NOTO_BY_CODE } from './stickerData';
import { DEFAULT_FONT } from './fontList';
import { FontPicker } from './FontPicker';
import { ShowRange } from './ShowRange';

const STYLES: { value: TextStyle; label: string }[] = [
  { value: 'meme', label: 'meme' },
  { value: 'subtitle', label: 'subtitle' },
  { value: 'neon', label: 'neon' },
  { value: 'bubble', label: 'bubble' },
  { value: 'plain', label: 'plain' },
];
const ANIMS: { value: LayerAnim; label: string; text?: boolean }[] = [
  { value: 'none', label: 'none' },
  { value: 'pop', label: 'pop in' },
  { value: 'fade', label: 'fade in' },
  { value: 'type', label: 'typing', text: true },
  { value: 'blink', label: 'blink' },
  { value: 'spin', label: 'spin' },
  { value: 'wiggle', label: 'wiggle' },
  { value: 'pulse', label: 'pulse' },
  { value: 'float', label: 'float' },
];

let next = 0;
export const uid = () => `l${Date.now().toString(36)}${(next++).toString(36)}`;

const base = { rotation: 0, opacity: 1, flip: false, anim: 'none' as LayerAnim, from: null, to: null };
export const newText = (): TextLayer => ({ ...base, id: uid(), kind: 'text', text: 'Your text', style: 'meme', font: DEFAULT_FONT, size: 0.12, color: '#ffffff', x: 0.5, y: 0.85 });
export const newSticker = (sticker: StickerRef, name: string): StickerLayer => ({ ...base, id: uid(), kind: 'sticker', sticker, name, size: 0.35, x: 0.5, y: 0.5 });
/** A copy a little down and to the right, so it's visible. */
export const duplicate = (l: Layer): Layer => ({ ...l, id: uid(), x: Math.min(1, l.x + 0.04), y: Math.min(1, l.y + 0.04) });

export function layerLabel(l: Layer) {
  if (l.kind === 'text') return l.text.split('\n')[0] || '(empty text)';
  return l.name;
}

/** A small picture for a layer: the emoji, a saved sticker, or "T" for text. */
export function LayerThumb({ layer, mineUrl }: { layer: Layer; mineUrl?: string }) {
  if (layer.kind === 'text') return <span className="gm-thumb gm-thumb-t">T</span>;
  if (layer.sticker.type === 'noto') return <span className="gm-thumb">{NOTO_BY_CODE.get(layer.sticker.code)?.char ?? '?'}</span>;
  return mineUrl ? <img className="gm-thumb" src={mineUrl} alt="" /> : <span className="gm-thumb">?</span>;
}

/** The layers, top one first, with order, copy and delete buttons. */
export function LayerList({
  layers,
  selected,
  onSelect,
  onChange,
  mineUrls,
}: {
  layers: Layer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layers: Layer[]) => void;
  mineUrls: Map<string, string>;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const nextList = [...layers];
    [nextList[i], nextList[j]] = [nextList[j], nextList[i]];
    onChange(nextList);
  };
  if (!layers.length) return <p className="note">No text or stickers yet. Add some, then drag them on the preview: corners resize, the round handle turns.</p>;
  return (
    <ul className="gm-layers">
      {layers
        .map((l, i) => ({ l, i }))
        .reverse()
        .map(({ l, i }) => (
          <li key={l.id}>
            <button type="button" className="gm-layer" aria-pressed={l.id === selected} onClick={() => onSelect(l.id === selected ? null : l.id)}>
              <LayerThumb layer={l} mineUrl={l.kind === 'sticker' && l.sticker.type === 'mine' ? mineUrls.get(l.sticker.id) : undefined} />
              <span className="gm-layer-name">{layerLabel(l)}</span>
            </button>
            <button type="button" className="icon-btn" aria-label={`Bring ${layerLabel(l)} forward`} title="Forward (Ctrl + ])" disabled={i === layers.length - 1} onClick={() => move(i, 1)}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label={`Send ${layerLabel(l)} back`} title="Back (Ctrl + [)" disabled={i === 0} onClick={() => move(i, -1)}>
              ↓
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Duplicate ${layerLabel(l)}`}
              title="Duplicate (Ctrl + D)"
              onClick={() => {
                const copy = duplicate(l);
                onChange([...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)]);
                onSelect(copy.id);
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${layerLabel(l)}`}
              title="Remove (Delete)"
              onClick={() => {
                onChange(layers.filter((x) => x.id !== l.id));
                if (selected === l.id) onSelect(null);
              }}
            >
              ×
            </button>
          </li>
        ))}
    </ul>
  );
}

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <div className="opt-row">
      <span className="opt-label">{label}</span>
      <div className="range">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{show}</output>
      </div>
    </div>
  );
}

function Field({ id, label, help, children }: { id?: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {help && <Help label={label} text={help} />}
      </span>
      {children}
    </div>
  );
}


/** Everything about the selected layer. */
export function LayerProps({ layer, onChange, duration, now }: { layer: Layer; onChange: (p: Partial<Layer>) => void; duration: number; now?: () => number }) {
  const text = layer.kind === 'text' ? layer : null;
  return (
    <div className="give-box">
      <div className="opt-row">
        <span className="field-label">{layerLabel(layer)}</span>
        <span className="note mono">{layer.kind === 'sticker' ? 'sticker' : 'text'}</span>
      </div>
      {text && (
        <>
          <Field id="gm-text" label="Text">
            <textarea id="gm-text" className="textarea" rows={2} value={text.text} onChange={(e) => onChange({ text: e.target.value } as Partial<TextLayer>)} />
          </Field>
          <Field label="Style" help="meme: white letters with a black outline. subtitle: on a dark box. neon: glowing. bubble: in a speech bubble. plain: letters with a soft shadow.">
            <Segmented label="Style" value={text.style} options={STYLES} onChange={(style) => onChange({ style, ...(style === 'meme' ? { font: DEFAULT_FONT, color: '#ffffff' } : {}) } as Partial<TextLayer>)} />
          </Field>
          <div className="fields gm-font-fields">
            <div className="field">
              <span className="field-label">Font</span>
              <FontPicker value={text.font} onChange={(font) => onChange({ font } as Partial<TextLayer>)} />
            </div>
            <Field id="gm-color" label="Color">
              <input id="gm-color" type="color" className="give-color" value={text.color} onChange={(e) => onChange({ color: e.target.value } as Partial<TextLayer>)} />
            </Field>
          </div>
        </>
      )}
      <Slider label="Size" value={layer.size} min={0.03} max={2} step={0.01} show={`${Math.round(layer.size * 100)}%`} onChange={(size) => onChange({ size })} />
      <Slider label="Turn" value={layer.rotation} min={-180} max={180} step={1} show={`${Math.round(layer.rotation)}°`} onChange={(rotation) => onChange({ rotation })} />
      <Slider label="Opacity" value={layer.opacity} min={0.05} max={1} step={0.05} show={`${Math.round(layer.opacity * 100)}%`} onChange={(opacity) => onChange({ opacity })} />
      <div className="opt-row">
        <span className="opt-label">Mirror</span>
        <Toggle label="Mirror" checked={layer.flip} onChange={(flip) => onChange({ flip })} />
      </div>
      <Field label="Animation" help="How it moves. pop in, fade in and typing happen when it appears; the others repeat for as long as it shows.">
        <Segmented label="Animation" value={layer.anim} options={ANIMS.filter((a) => !a.text || text)} onChange={(anim) => onChange({ anim })} />
      </Field>
      <Field label="When it shows" help="Drag the two ends to choose when in the GIF this shows; drag the middle to move it. The thin line is where the preview is playing. Arrow keys move a selected end (Shift: 1 s).">
        <ShowRange duration={duration} from={layer.from} to={layer.to} onChange={(from, to) => onChange({ from, to })} now={now} />
      </Field>
    </div>
  );
}
