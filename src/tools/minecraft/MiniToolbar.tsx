import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { Help } from '../../components/Help';
import { MC_COLORS, MC_FORMATS } from '../../lib/mc/text';
import { PRIDE_FLAGS } from '../../lib/mc/minimessage';

export type Placeholder = { value: string; label: string };

type Effect = 'hex' | 'gradient' | 'transition' | 'rainbow' | 'pride' | 'shadow' | 'font' | 'head' | 'key';

// The common effects are always shown; rarely useful ones wait behind "more".
const MAIN_EFFECTS: { value: Effect; label: string }[] = [
  { value: 'gradient', label: 'gradient' },
  { value: 'rainbow', label: 'rainbow' },
  { value: 'hex', label: 'any color' },
  { value: 'pride', label: 'pride' },
  { value: 'shadow', label: 'shadow' },
  { value: 'head', label: 'player head' },
];
const MORE_EFFECTS: { value: Effect; label: string }[] = [
  { value: 'transition', label: 'transition' },
  { value: 'font', label: 'font' },
  { value: 'key', label: 'keybind' },
];

const EFFECT_HELP: Record<Effect, string> = {
  hex: 'Any color by its hex code, e.g. #ff66aa. Shows in the MOTD; elsewhere it turns into the nearest basic color.',
  gradient: 'Fades through 2 or more colors across the selected text. Phase shifts where the fade starts (-1 to 1).',
  transition: 'Colors the whole selection with one color, picked between the stops by the phase. Handy with placeholders that change.',
  rainbow: 'Cycles through every hue across the text. Phase shifts the starting color, reverse runs it backwards.',
  pride: 'A gradient in the colors of a pride flag (MiniMessage 4.18+).',
  shadow: 'Changes the color and strength of the text shadow, or turns it off (Minecraft 1.21.4+).',
  font: 'Switches font. uniform is the plain Unicode font; alt is the enchanting-table alphabet; illageralt is the illager runes. The preview only hints at alt fonts.',
  head: 'Puts a player’s head right in the text (Minecraft 1.21.9+ and a recent server). Older clients show nothing.',
  key: 'Shows whatever key the player has bound, e.g. their jump key. Each player sees their own binding.',
};

const KEYS = [
  ['key.jump', 'jump'],
  ['key.sneak', 'sneak'],
  ['key.sprint', 'sprint'],
  ['key.inventory', 'inventory'],
  ['key.drop', 'drop item'],
  ['key.chat', 'chat'],
  ['key.attack', 'attack'],
  ['key.use', 'use item'],
  ['key.swapOffhand', 'swap hands'],
  ['key.playerlist', 'player list'],
] as const;

const colorInput = { width: 32, height: 32, padding: 0, border: 0, background: 'none', cursor: 'pointer', flex: 'none' } as const;

/**
 * MiniMessage formatting bar. Buttons never take focus, so the field being edited keeps its
 * selection and `onWrap` wraps exactly that text.
 */
export function MiniToolbar({
  onWrap,
  onInsert,
  placeholders,
  basic,
  hint,
}: {
  onWrap: (open: string, close: string) => void;
  onInsert: (text: string) => void;
  placeholders: Placeholder[];
  /** Only what works outside the MOTD (hover, player-count text): basic colors and styles. */
  basic?: boolean;
  hint?: string;
}) {
  const [effect, setEffect] = useState<Effect>('gradient');
  const [more, setMore] = useState(false);
  const [hex, setHex] = useState('#ff66aa');
  const [stops, setStops] = useState(['#b6f24a', '#5eead4']);
  const [phase, setPhase] = useState(0);
  const [tPhase, setTPhase] = useState(0.5);
  const [rbReverse, setRbReverse] = useState(false);
  const [rbPhase, setRbPhase] = useState(0);
  const [flag, setFlag] = useState('pride');
  const [shadow, setShadow] = useState('#000000');
  const [shadowAlpha, setShadowAlpha] = useState(0.6);
  const [noShadow, setNoShadow] = useState(false);
  const [font, setFont] = useState('uniform');
  const [head, setHead] = useState('${player name}');
  const [key, setKey] = useState<string>('key.jump');
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const fmt = (n: number) => String(Math.round(n * 100) / 100);

  const apply = () => {
    switch (effect) {
      case 'hex':
        return onWrap(`<color:${hex}>`, '</color>');
      case 'gradient':
        return onWrap(`<gradient:${stops.join(':')}${phase ? `:${fmt(phase)}` : ''}>`, '</gradient>');
      case 'transition':
        return onWrap(`<transition:${stops.join(':')}:${fmt(tPhase)}>`, '</transition>');
      case 'rainbow': {
        const arg = `${rbReverse ? '!' : ''}${rbPhase || ''}`;
        return onWrap(`<rainbow${arg ? `:${arg}` : ''}>`, '</rainbow>');
      }
      case 'pride':
        return onWrap(`<pride:${flag}>`, '</pride>');
      case 'shadow':
        return noShadow ? onWrap('<shadow:#00000000>', '</shadow>') : onWrap(`<shadow:${shadow}:${fmt(shadowAlpha)}>`, '</shadow>');
      case 'font':
        return onWrap(`<font:${font}>`, '</font>');
      case 'head':
        return onInsert(`<head:${head.trim() || 'Steve'}>`);
      case 'key':
        return onInsert(`<key:${key}>`);
    }
  };

  const inserts = effect === 'head' || effect === 'key';
  const stopsEditor = (
    <span className="grad" role="group" aria-label="Colors">
      {stops.map((c, i) => (
        <input
          key={i}
          type="color"
          value={c}
          aria-label={`Color ${i + 1}`}
          style={colorInput}
          onChange={(e) => setStops(stops.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      {stops.length < 6 && (
        <button type="button" className="icon-btn" aria-label="Add a color" onMouseDown={keep} onClick={() => setStops([...stops, stops[stops.length - 1]])}>
          +
        </button>
      )}
      {stops.length > 2 && (
        <button type="button" className="icon-btn" aria-label="Remove the last color" onMouseDown={keep} onClick={() => setStops(stops.slice(0, -1))}>
          −
        </button>
      )}
    </span>
  );

  const effects = more || MORE_EFFECTS.some((e) => e.value === effect) ? [...MAIN_EFFECTS, ...MORE_EFFECTS] : MAIN_EFFECTS;

  return (
    <div className="mini-toolbar">
      {hint && <p className="note">{hint}</p>}
      <div className="seg compact" role="group" aria-label="Color">
        {MC_COLORS.map((c) => (
          <button key={c.name} type="button" title={`<${c.name}>`} aria-label={`Color ${c.label}`} onMouseDown={keep} onClick={() => onWrap(`<${c.name}>`, `</${c.name}>`)} className="swatch-btn">
            <span className="swatch" style={{ background: c.hex }} />
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Style">
        {MC_FORMATS.map((f) => (
          <button key={f.name} type="button" onMouseDown={keep} onClick={() => onWrap(`<${f.name}>`, `</${f.name}>`)} title={`<${f.name}>`}>
            {f.label.toLowerCase()}
          </button>
        ))}
      </div>

      {!basic && (
      <div className="effect-box">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Segmented label="Effect" value={effect} onChange={setEffect} compact options={effects} />
          <button type="button" className="rail-ghost" aria-expanded={effects.length > MAIN_EFFECTS.length} onClick={() => setMore(!more)}>
            {effects.length > MAIN_EFFECTS.length ? 'fewer' : 'more…'}
          </button>
        </div>
        <div className="effect-opts">
          {effect === 'hex' && (
            <>
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="Hex color" style={colorInput} />
              <input
                className="input mono"
                style={{ width: 110, minHeight: 36 }}
                aria-label="Hex code"
                value={hex}
                onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setHex(e.target.value.toLowerCase())}
              />
            </>
          )}
          {(effect === 'gradient' || effect === 'transition') && stopsEditor}
          {effect === 'gradient' && (
            <label className="range mono" style={{ fontSize: 12 }}>
              phase
              <input type="range" min={-1} max={1} step={0.1} value={phase} onChange={(e) => setPhase(Number(e.target.value))} style={{ width: 110 }} />
              <output>{fmt(phase)}</output>
            </label>
          )}
          {effect === 'transition' && (
            <label className="range mono" style={{ fontSize: 12 }}>
              position
              <input type="range" min={0} max={1} step={0.05} value={tPhase} onChange={(e) => setTPhase(Number(e.target.value))} style={{ width: 110 }} />
              <output>{fmt(tPhase)}</output>
            </label>
          )}
          {effect === 'rainbow' && (
            <>
              <label className="mono" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={rbReverse} onChange={(e) => setRbReverse(e.target.checked)} />
                reverse
              </label>
              <label className="range mono" style={{ fontSize: 12 }}>
                phase
                <input type="range" min={0} max={9} step={1} value={rbPhase} onChange={(e) => setRbPhase(Number(e.target.value))} style={{ width: 110 }} />
                <output>{rbPhase}</output>
              </label>
            </>
          )}
          {effect === 'pride' && (
            <>
              <select className="select mono" aria-label="Flag" value={flag} onChange={(e) => setFlag(e.target.value)} style={{ minHeight: 36 }}>
                {Object.keys(PRIDE_FLAGS).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <span aria-hidden="true" style={{ display: 'inline-flex', height: 16, width: 120, borderRadius: 3, overflow: 'hidden' }}>
                {PRIDE_FLAGS[flag].map((c, i) => (
                  <span key={i} style={{ flex: 1, background: c }} />
                ))}
              </span>
            </>
          )}
          {effect === 'shadow' && (
            <>
              <label className="mono" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={noShadow} onChange={(e) => setNoShadow(e.target.checked)} />
                no shadow
              </label>
              {!noShadow && (
                <>
                  <input type="color" value={shadow} onChange={(e) => setShadow(e.target.value)} aria-label="Shadow color" style={colorInput} />
                  <label className="range mono" style={{ fontSize: 12 }}>
                    strength
                    <input type="range" min={0.05} max={1} step={0.05} value={shadowAlpha} onChange={(e) => setShadowAlpha(Number(e.target.value))} style={{ width: 100 }} />
                    <output>{fmt(shadowAlpha)}</output>
                  </label>
                </>
              )}
            </>
          )}
          {effect === 'font' && (
            <select className="select mono" aria-label="Font" value={font} onChange={(e) => setFont(e.target.value)} style={{ minHeight: 36 }}>
              <option value="uniform">uniform (plain Unicode)</option>
              <option value="alt">alt (enchanting table)</option>
              <option value="illageralt">illageralt (illager runes)</option>
              <option value="default">default</option>
            </select>
          )}
          {effect === 'head' && (
            <input className="input mono" style={{ width: 180, minHeight: 36 }} aria-label="Player name or UUID" value={head} onChange={(e) => setHead(e.target.value)} />
          )}
          {effect === 'key' && (
            <select className="select mono" aria-label="Key" value={key} onChange={(e) => setKey(e.target.value)} style={{ minHeight: 36 }}>
              {KEYS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l} · {k}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-sm" onMouseDown={keep} onClick={apply}>
            {inserts ? 'insert' : 'apply to selection'}
          </button>
          <Help label={effect} text={EFFECT_HELP[effect]} />
        </div>
      </div>
      )}

      <select
        className="select mono"
        aria-label="Insert a live value"
        value=""
        onChange={(e) => {
          if (e.target.value) onInsert(e.target.value);
        }}
      >
        <option value="">+ insert a live value (player name, players online…)</option>
        {placeholders.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label} · {p.value}
          </option>
        ))}
      </select>
    </div>
  );
}
