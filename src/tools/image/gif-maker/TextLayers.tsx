import { Help } from '../../../components/Help';
import { Segmented } from '../../../components/ui';
import { FONTS, type TextAnim, type TextLayer, type TextStyle } from './compose';

const STYLES: { value: TextStyle; label: string }[] = [
  { value: 'meme', label: 'meme' },
  { value: 'subtitle', label: 'subtitle' },
  { value: 'neon', label: 'neon' },
  { value: 'bubble', label: 'bubble' },
  { value: 'plain', label: 'plain' },
];
const ANIMS: { value: TextAnim; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'type', label: 'typing' },
  { value: 'pop', label: 'pop in' },
  { value: 'blink', label: 'blink' },
];
const EMOJI = ['😂', '🤣', '😭', '💀', '🔥', '❤️', '👍', '😎', '🤔', '😍', '🥳', '🤯', '😱', '👀', '✨', '🎉', '💯', '🙏', '😡', '🐸', '⭐', '💥', '👑', '🗿'];

let next = 0;
const uid = () => `t${Date.now().toString(36)}${(next++).toString(36)}`;

export const newText = (): TextLayer => ({ id: uid(), text: 'Your text', style: 'meme', font: FONTS[0].value, size: 0.12, color: '#ffffff', x: 0.5, y: 0.85, anim: 'none', from: null, to: null });
const newSticker = (emoji: string): TextLayer => ({ ...newText(), text: emoji, style: 'plain', size: 0.25, x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 });

const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));

/** Texts and emoji stickers on the GIF; the selected one is edited below the list. */
export function TextLayers({
  layers,
  selected,
  onSelect,
  onChange,
  duration,
}: {
  layers: TextLayer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layers: TextLayer[]) => void;
  duration: number;
}) {
  const layer = layers.find((l) => l.id === selected) ?? null;
  const set = (p: Partial<TextLayer>) => layer && onChange(layers.map((l) => (l.id === layer.id ? { ...l, ...p } : l)));
  const add = (l: TextLayer) => {
    onChange([...layers, l]);
    onSelect(l.id);
  };

  return (
    <>
      <div className="seg">
        <button type="button" className="btn btn-sm" onClick={() => add(newText())}>
          + text
        </button>
        <details className="gm-emoji">
          <summary className="btn btn-sm">+ emoji sticker</summary>
          <div className="gm-emoji-grid">
            {EMOJI.map((e) => (
              <button key={e} type="button" aria-label={`Add ${e}`} onClick={(ev) => {
                add(newSticker(e));
                (ev.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              }}>
                {e}
              </button>
            ))}
          </div>
        </details>
      </div>
      {layers.length > 0 && (
        <ul className="gm-layers">
          {layers.map((l) => (
            <li key={l.id}>
              <button type="button" className="gm-layer" aria-pressed={l.id === selected} onClick={() => onSelect(l.id === selected ? null : l.id)}>
                {l.text.split('\n')[0] || '(empty)'}
              </button>
              <button type="button" className="btn btn-sm" aria-label={`Remove ${l.text}`} onClick={() => {
                onChange(layers.filter((x) => x.id !== l.id));
                if (selected === l.id) onSelect(null);
              }}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {layers.length === 0 && <p className="note">No text yet. Add one, then drag it on the preview to place it.</p>}
      {layer && (
        <div className="give-box">
          <div className="field">
            <label htmlFor="gm-text" className="field-label">
              Text
            </label>
            <textarea id="gm-text" className="textarea" rows={2} value={layer.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
          <Segmented label="Style" value={layer.style} options={STYLES} onChange={(style) => set({ style, ...(style === 'meme' ? { font: FONTS[0].value, color: '#ffffff' } : {}) })} />
          <div className="fields">
            <div className="field">
              <label htmlFor="gm-font" className="field-label">
                Font
              </label>
              <select id="gm-font" className="select" value={layer.font} onChange={(e) => set({ font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gm-color" className="field-label">
                Color
              </label>
              <input id="gm-color" type="color" className="give-color" value={layer.color} onChange={(e) => set({ color: e.target.value })} />
            </div>
          </div>
          <div className="opt-row">
            <span className="opt-label">Size</span>
            <div className="range">
              <input type="range" aria-label="Text size" min={0.04} max={0.5} step={0.01} value={layer.size} onChange={(e) => set({ size: Number(e.target.value) })} />
              <output>{Math.round(layer.size * 100)}%</output>
            </div>
          </div>
          <Segmented label="Animation" value={layer.anim} options={ANIMS} onChange={(anim) => set({ anim })} />
          <div className="fields">
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <label htmlFor="gm-from" className="field-label">
                  Shows from
                </label>
                <Help label="When the text shows" text={`Seconds into the GIF (it's ${duration.toFixed(1)} s long). Empty = from the start / until the end.`} />
              </span>
              <input id="gm-from" className="input mono" type="number" min={0} step={0.1} placeholder="start" value={layer.from ?? ''} onChange={(e) => set({ from: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="gm-to" className="field-label">
                until
              </label>
              <input id="gm-to" className="input mono" type="number" min={0} step={0.1} placeholder="end" value={layer.to ?? ''} onChange={(e) => set({ to: num(e.target.value) })} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
