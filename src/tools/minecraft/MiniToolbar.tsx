import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { Help } from '../../components/Help';
import { MC_COLORS, MC_FORMATS } from '../../lib/mc/text';
import { PRIDE_FLAGS } from '../../lib/mc/minimessage';
import { t } from '../../lib/i18n-core';

export type Placeholder = { value: string; label: string };

type Effect = 'hex' | 'gradient' | 'transition' | 'rainbow' | 'pride' | 'shadow' | 'font' | 'head' | 'key';

// The common effects are always shown; rarely useful ones wait behind "more".
const MAIN_EFFECTS: { value: Effect; label: string }[] = [
  { value: 'gradient', label: t('gradient') },
  { value: 'rainbow', label: t('rainbow') },
  { value: 'hex', label: t('any color') },
  { value: 'pride', label: t('pride') },
  { value: 'shadow', label: t('shadow') },
  { value: 'head', label: t('player head') },
];
const MORE_EFFECTS: { value: Effect; label: string }[] = [
  { value: 'transition', label: t('transition') },
  { value: 'font', label: t('font') },
  { value: 'key', label: t('keybind') },
];

const EFFECT_HELP: Record<Effect, string> = {
  hex: t('Any color by its hex code, e.g. #ff66aa. Shows in the MOTD; elsewhere it turns into the nearest basic color.'),
  gradient: t('Fades through 2 or more colors across the selected text. Phase shifts where the fade starts (-1 to 1).'),
  transition: t('Colors the whole selection with one color, picked between the stops by the phase. Handy with placeholders that change.'),
  rainbow: t('Cycles through every hue across the text. Phase shifts the starting color, reverse runs it backwards.'),
  pride: t('A gradient in the colors of a pride flag (MiniMessage 4.18+).'),
  shadow: t('Changes the color and strength of the text shadow, or turns it off (Minecraft 1.21.4+).'),
  font: t('Switches font. uniform is the plain Unicode font; alt is the enchanting-table alphabet; illageralt is the illager runes. The preview only hints at alt fonts.'),
  head: t('Puts a player’s head right in the text (Minecraft 1.21.9+ and a recent server). Older clients show nothing.'),
  key: t('Shows whatever key the player has bound, e.g. their jump key. Each player sees their own binding.'),
};

const KEYS = [
  ['key.jump', t('jump')],
  ['key.sneak', t('sneak')],
  ['key.sprint', t('sprint')],
  ['key.inventory', t('inventory')],
  ['key.drop', t('drop item')],
  ['key.chat', t('chat')],
  ['key.attack', t('attack')],
  ['key.use', t('use item')],
  ['key.swapOffhand', t('swap hands')],
  ['key.playerlist', t('player list')],
];

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
    <span className="grad" role="group" aria-label={t('Colors')}>
      {stops.map((c, i) => (
        <input
          key={i}
          type="color"
          value={c}
          aria-label={t('Color {n}', { n: i + 1 })}
          style={colorInput}
          onChange={(e) => setStops(stops.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      {stops.length < 6 && (
        <button type="button" className="icon-btn" aria-label={t('Add a color')} onMouseDown={keep} onClick={() => setStops([...stops, stops[stops.length - 1]])}>
          +
        </button>
      )}
      {stops.length > 2 && (
        <button type="button" className="icon-btn" aria-label={t('Remove the last color')} onMouseDown={keep} onClick={() => setStops(stops.slice(0, -1))}>
          −
        </button>
      )}
    </span>
  );

  const effects = more || MORE_EFFECTS.some((e) => e.value === effect) ? [...MAIN_EFFECTS, ...MORE_EFFECTS] : MAIN_EFFECTS;

  return (
    <div className="mini-toolbar">
      {hint && <p className="note">{hint}</p>}
      <div className="seg compact" role="group" aria-label={t('Color')}>
        {MC_COLORS.map((c) => (
          <button key={c.name} type="button" title={`<${c.name}>`} aria-label={t('Color {label}', { label: c.label })} onMouseDown={keep} onClick={() => onWrap(`<${c.name}>`, `</${c.name}>`)} className="swatch-btn">
            <span className="swatch" style={{ background: c.hex }} />
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label={t('Style')}>
        {MC_FORMATS.map((f) => (
          <button key={f.name} type="button" onMouseDown={keep} onClick={() => onWrap(`<${f.name}>`, `</${f.name}>`)} title={`<${f.name}>`}>
            {f.label.toLowerCase()}
          </button>
        ))}
      </div>

      {!basic && (
      <div className="effect-box">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Segmented label={t('Effect')} value={effect} onChange={setEffect} compact options={effects} />
          <button type="button" className="rail-ghost" aria-expanded={effects.length > MAIN_EFFECTS.length} onClick={() => setMore(!more)}>
            {effects.length > MAIN_EFFECTS.length ? t('fewer') : t('more…')}
          </button>
        </div>
        <div className="effect-opts">
          {effect === 'hex' && (
            <>
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label={t('Hex color')} style={colorInput} />
              <input
                className="input mono"
                style={{ width: 110, minHeight: 36 }}
                aria-label={t('Hex code')}
                value={hex}
                onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setHex(e.target.value.toLowerCase())}
              />
            </>
          )}
          {(effect === 'gradient' || effect === 'transition') && stopsEditor}
          {effect === 'gradient' && (
            <label className="range mono" style={{ fontSize: 12 }}>
              {t('phase')}
              <input type="range" min={-1} max={1} step={0.1} value={phase} onChange={(e) => setPhase(Number(e.target.value))} style={{ width: 110 }} />
              <output>{fmt(phase)}</output>
            </label>
          )}
          {effect === 'transition' && (
            <label className="range mono" style={{ fontSize: 12 }}>
              {t('position')}
              <input type="range" min={0} max={1} step={0.05} value={tPhase} onChange={(e) => setTPhase(Number(e.target.value))} style={{ width: 110 }} />
              <output>{fmt(tPhase)}</output>
            </label>
          )}
          {effect === 'rainbow' && (
            <>
              <label className="mono" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={rbReverse} onChange={(e) => setRbReverse(e.target.checked)} />
                {t('reverse')}
              </label>
              <label className="range mono" style={{ fontSize: 12 }}>
                {t('phase')}
                <input type="range" min={0} max={9} step={1} value={rbPhase} onChange={(e) => setRbPhase(Number(e.target.value))} style={{ width: 110 }} />
                <output>{rbPhase}</output>
              </label>
            </>
          )}
          {effect === 'pride' && (
            <>
              <select className="select mono" aria-label={t('Flag')} value={flag} onChange={(e) => setFlag(e.target.value)} style={{ minHeight: 36 }}>
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
                {t('no shadow')}
              </label>
              {!noShadow && (
                <>
                  <input type="color" value={shadow} onChange={(e) => setShadow(e.target.value)} aria-label={t('Shadow color')} style={colorInput} />
                  <label className="range mono" style={{ fontSize: 12 }}>
                    {t('strength')}
                    <input type="range" min={0.05} max={1} step={0.05} value={shadowAlpha} onChange={(e) => setShadowAlpha(Number(e.target.value))} style={{ width: 100 }} />
                    <output>{fmt(shadowAlpha)}</output>
                  </label>
                </>
              )}
            </>
          )}
          {effect === 'font' && (
            <select className="select mono" aria-label={t('Font')} value={font} onChange={(e) => setFont(e.target.value)} style={{ minHeight: 36 }}>
              <option value="uniform">{t('uniform (plain Unicode)')}</option>
              <option value="alt">{t('alt (enchanting table)')}</option>
              <option value="illageralt">{t('illageralt (illager runes)')}</option>
              <option value="default">{t('default')}</option>
            </select>
          )}
          {effect === 'head' && (
            <input className="input mono" style={{ width: 180, minHeight: 36 }} aria-label={t('Player name or UUID')} value={head} onChange={(e) => setHead(e.target.value)} />
          )}
          {effect === 'key' && (
            <select className="select mono" aria-label={t('Key')} value={key} onChange={(e) => setKey(e.target.value)} style={{ minHeight: 36 }}>
              {KEYS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l} · {k}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-sm" onMouseDown={keep} onClick={apply}>
            {inserts ? t('insert') : t('apply to selection')}
          </button>
          <Help label={effect} text={EFFECT_HELP[effect]} />
        </div>
      </div>
      )}

      {placeholders.length > 0 && (
        <select
          className="select mono"
          aria-label={t('Insert a live value')}
          value=""
          onChange={(e) => {
            if (e.target.value) onInsert(e.target.value);
          }}
        >
          <option value="">{t('+ insert a live value (player name, players online…)')}</option>
          {placeholders.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} · {p.value}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
