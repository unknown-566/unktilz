import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Workbench } from '../../../components/Workbench';
import { Output, Panel, Segmented, num } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { fromHex, parseColor, toHex, type RGB } from '../../../lib/color';
import {
  decodeGrad,
  encodeGrad,
  gradientCss,
  gradientPng,
  gradientSvg,
  gradientValue,
  PRESETS,
  randomGradient,
  stop,
  stopColor,
  stopsFromText,
  tailwindClass,
  type Blend,
  type Grad,
  type GradKind,
  type Stop,
} from '../../../lib/gradient';
import { useAutosave } from '../../../lib/saved';
import { saveBlob } from '../../../queue/download';
import { MC_COLORS } from '../../../lib/mc/text';
import { StopBar } from './StopBar';
import { fmtNum, t } from '../../../lib/i18n-core';

const START = (): Grad => ({
  kind: 'linear',
  angle: 135,
  shape: 'circle',
  cx: 50,
  cy: 50,
  blend: 'oklab',
  stops: [stop(fromHex('#3b82f6')!, 0), stop(fromHex('#ec4899')!, 100)],
});

// Arrows for the 8 directions (CSS angles: 0 = up, clockwise).
const DIRECTIONS: [number, string][] = [
  [315, '↖'],
  [0, '↑'],
  [45, '↗'],
  [270, '←'],
  [-1, ''],
  [90, '→'],
  [225, '↙'],
  [180, '↓'],
  [135, '↘'],
];

const SIZES = ['1920x1080', '1080x1080', '1080x1920', '512x512', 'custom'] as const;
type Size = (typeof SIZES)[number];
type Format = 'css' | 'tailwind' | 'svg';
type Saved = { code: string; size: Size; w: string; h: string; format: Format };

export default function Gradient() {
  const [params, setParams] = useSearchParams();
  const [grad, setGrad] = useState<Grad>(() => decodeGrad(params.get('g') ?? '') ?? START());
  const [selected, setSelected] = useState(() => grad.stops[0].id);
  const [size, setSize] = useState<Size>('1920x1080');
  const [cw, setCw] = useState('1600');
  const [ch, setCh] = useState('900');
  const [format, setFormat] = useState<Format>('css');
  const fromUrl = useRef(!!params.get('g'));

  const code = encodeGrad(grad);
  const load = (g: Grad) => {
    setGrad(g);
    setSelected(g.stops[0].id);
  };
  const set = (patch: Partial<Grad>) => setGrad((g) => ({ ...g, ...patch }));
  const setStops = (stops: Stop[]) => set({ stops });

  useAutosave<Saved>('gradient', { code, size, w: cw, h: ch, format }, (v) => {
    const g = decodeGrad(v.code ?? '');
    if (g && !fromUrl.current) load(g);
    if (SIZES.includes(v.size)) setSize(v.size);
    if (v.w) setCw(v.w);
    if (v.h) setCh(v.h);
    if (['css', 'tailwind', 'svg'].includes(v.format)) setFormat(v.format);
  });

  // The gradient in the address, so a link opens it (replaced, not a new history step each time).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (params.get('g') !== code) setParams((p) => ({ ...Object.fromEntries(p), g: code }), { replace: true });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const sel = grad.stops.find((s) => s.id === selected) ?? grad.stops[0];
  const editStop = (patch: Partial<Stop>) => setStops(grad.stops.map((s) => (s.id === sel.id ? { ...s, ...patch } : s)));
  const [w, h] = size === 'custom' ? [Math.round(Math.min(8192, Math.max(1, num(cw, 1600)))), Math.round(Math.min(8192, Math.max(1, num(ch, 900))))] : size.split('x').map(Number);
  const svg = gradientSvg(grad, w, h);
  const out = format === 'css' ? gradientCss(grad) : format === 'tailwind' ? tailwindClass(grad) : (svg ?? '');

  const side = (
    <Panel title={t('preview')}>
      <div className="gr-preview" style={{ aspectRatio: `${w} / ${h}` }}>
        <span style={{ backgroundImage: gradientValue(grad) }} />
      </div>
    </Panel>
  );

  const output = (
    <Panel title={t('code')}>
      <Segmented
        label={t('Format')}
        compact
        value={format}
        onChange={setFormat}
        options={[
          { value: 'css', label: 'CSS' },
          { value: 'tailwind', label: 'Tailwind' },
          { value: 'svg', label: 'SVG' },
        ]}
      />
      {format === 'svg' && !svg ? <p className="note">{t('SVG has no conic gradients. Use the PNG, or the CSS.')}</p> : <Output label={t('Code')} value={out} multiline />}
      {format === 'css' && grad.blend !== 'srgb' && <p className="note">{t('The first line is for old browsers that can’t blend in {blend}; the steps in it look almost the same.', { blend: grad.blend === 'oklab' ? 'OKLab' : 'OKLCH' })}</p>}

      <div className="opt-row gr-size">
        <span className="opt-label" id="gr-size">
          {t('Picture size')}
        </span>
        <Segmented labelledBy="gr-size" compact value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: s === 'custom' ? t('own') : s.replace('x', '×') }))} />
      </div>
      {size === 'custom' && (
        <div className="gr-own">
          <input className="input mono" type="number" min={1} max={8192} value={cw} aria-label={t('Width')} onChange={(e) => setCw(e.target.value)} />
          <span aria-hidden="true">×</span>
          <input className="input mono" type="number" min={1} max={8192} value={ch} aria-label={t('Height')} onChange={(e) => setCh(e.target.value)} />
          <span className="muted">px</span>
        </div>
      )}
      <div className="ip-actions">
        <button type="button" className="btn btn-primary" onClick={() => void gradientPng(grad, w, h).then((b) => saveBlob(b, `gradient-${w}x${h}.png`))}>
          {t('download PNG')}
        </button>
        {svg && (
          <button type="button" className="btn" onClick={() => saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `gradient-${w}x${h}.svg`)}>
            {t('download SVG')}
          </button>
        )}
      </div>
    </Panel>
  );

  return (
    <Workbench preview={side} output={output}>
      <Panel title={t('gradient')}>
        <div className="gr-form">
          <div className="opt-row">
            <span className="opt-label" id="gr-kind">
              {t('Type')}
            </span>
            <Segmented
              labelledBy="gr-kind"
              compact
              value={grad.kind}
              onChange={(kind: GradKind) => set({ kind })}
              options={[
                { value: 'linear', label: t('linear') },
                { value: 'radial', label: t('radial') },
                { value: 'conic', label: t('conic') },
              ]}
            />
          </div>

          {grad.kind !== 'radial' && (
            <div className="gr-angle">
              <div className="gr-dirs" role="group" aria-label={t('Direction')}>
                {DIRECTIONS.map(([a, arrow]) =>
                  a < 0 ? (
                    <span key="mid" />
                  ) : (
                    <button key={a} type="button" className="btn btn-sm" aria-pressed={grad.angle === a} aria-label={t('{deg}°', { deg: a })} onClick={() => set({ angle: a })}>
                      {arrow}
                    </button>
                  ),
                )}
              </div>
              <div className="field grow">
                <label className="field-label" htmlFor="gr-angle">
                  {grad.kind === 'conic' ? t('Starts at') : t('Angle')}
                </label>
                <div className="range">
                  <input id="gr-angle" type="range" min={0} max={359} value={grad.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
                  <output>{`${fmtNum(grad.angle)}°`}</output>
                </div>
              </div>
            </div>
          )}

          {grad.kind === 'radial' && (
            <div className="opt-row">
              <span className="opt-label" id="gr-shape">
                {t('Shape')}
              </span>
              <Segmented
                labelledBy="gr-shape"
                compact
                value={grad.shape}
                onChange={(shape: Grad['shape']) => set({ shape })}
                options={[
                  { value: 'circle', label: t('circle') },
                  { value: 'ellipse', label: t('ellipse') },
                ]}
              />
            </div>
          )}

          {grad.kind !== 'linear' && (
            <div className="gr-center">
              <span className="field-label">{t('Middle')}</span>
              {(['cx', 'cy'] as const).map((k) => (
                <div className="range" key={k}>
                  <span className="mono muted">{k === 'cx' ? 'X' : 'Y' /* i18n-ignore */}</span>
                  <input type="range" min={0} max={100} value={grad[k]} aria-label={k === 'cx' ? t('Middle across') : t('Middle down')} onChange={(e) => set({ [k]: Number(e.target.value) })} />
                  <output>{`${fmtNum(grad[k])} %`}</output>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title={t('colors')}>
        <StopBar grad={grad} selected={sel.id} onSelect={setSelected} onStops={setStops} />
        <StopEditor
          stop={sel}
          canRemove={grad.stops.length > 2}
          onChange={editStop}
          onRemove={() => {
            const rest = grad.stops.filter((s) => s.id !== sel.id);
            setStops(rest);
            setSelected(rest[0].id);
          }}
        />
        <div className="ip-actions">
          <button type="button" className="btn btn-sm" onClick={() => setStops(grad.stops.map((s) => ({ ...s, pos: 100 - s.pos })))}>
            {t('reverse order')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const order = [...grad.stops].sort((a, b) => a.pos - b.pos);
              setStops(order.map((s, i) => ({ ...s, pos: Math.round((i / (order.length - 1)) * 1000) / 10 })));
            }}
          >
            {t('spread evenly')}
          </button>
        </div>
        <p className="note">{t('Click the strip to add a color, drag the handles to move them. With a handle selected, the arrow keys move it and Delete removes it.')}</p>

        <div className="gr-blend">
          <span className="field-label gr-blend-label">
            {t('Blend the colors in')}
            <Help label={t('Blend the colors in')} text={t('How the colors in between are worked out. sRGB is the classic way and often goes grey or dark in the middle (blue to yellow, for example). OKLab keeps the brightness even; OKLCH also keeps the colors bright, going round the color wheel.')} />
          </span>
          <div className="gr-blends" role="group" aria-label={t('Blend the colors in')}>
            {(['srgb', 'oklab', 'oklch'] as Blend[]).map((b) => (
              <button key={b} type="button" className="gr-blend-btn" aria-pressed={grad.blend === b} onClick={() => set({ blend: b })}>
                <span style={{ backgroundImage: gradientValue({ ...grad, kind: 'linear', angle: 90, blend: b }) }} />
                <b className="mono">{b === 'srgb' ? 'sRGB' : b === 'oklab' ? 'OKLab' : 'OKLCH' /* i18n-ignore */}</b>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={t('ready gradients')}>
        <div className="gr-presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="gr-preset" title={p.name} onClick={() => load(p.make())}>
              <span style={{ backgroundImage: gradientValue(p.make()) }} />
              <small>{p.name}</small>
            </button>
          ))}
        </div>
        <div className="ip-actions">
          <button type="button" className="btn" onClick={() => load(randomGradient())}>
            {t('random')}
          </button>
        </div>
        <FromColors onStops={(stops) => load({ ...grad, stops })} />
      </Panel>
    </Workbench>
  );
}

/** The selected color: picker, any typed color, see-through amount and place. */
function StopEditor({ stop: s, canRemove, onChange, onRemove }: { stop: Stop; canRemove: boolean; onChange: (p: Partial<Stop>) => void; onRemove: () => void }) {
  const hex = toHex(s.color);
  const [text, setText] = useState(stopColor(s));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(stopColor(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, s.alpha, s.id]);

  return (
    <div className="gr-edit">
      <input type="color" className="gr-color" aria-label={t('Color')} value={hex.toLowerCase()} onChange={(e) => onChange({ color: fromHex(e.target.value)! })} />
      <input
        className="input mono gr-hex"
        value={text}
        spellCheck={false}
        aria-label={t('Color')}
        aria-invalid={bad || undefined}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          setBad(false);
          setText(stopColor(s));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim();
          const m = /^#?([0-9a-f]{6})([0-9a-f]{2})$/i.exec(v);
          const c: RGB | null = m ? fromHex(m[1]) : parseColor(v, MC_COLORS);
          setBad(!c && v !== '');
          if (c) onChange(m ? { color: c, alpha: parseInt(m[2], 16) / 255 } : { color: c });
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <label className="gr-mini">
        <span className="field-label">{t('Position')}</span>
        <input className="input mono" type="number" min={0} max={100} step={0.5} value={s.pos} onChange={(e) => onChange({ pos: Math.min(100, Math.max(0, num(e.target.value, s.pos))) })} />
      </label>
      <div className="gr-mini gr-alpha">
        <span className="field-label" id="gr-alpha">
          {t('Opacity')}
        </span>
        <div className="range">
          <input type="range" min={0} max={100} aria-labelledby="gr-alpha" value={Math.round(s.alpha * 100)} onChange={(e) => onChange({ alpha: Number(e.target.value) / 100 })} />
          <output>{`${Math.round(s.alpha * 100)} %`}</output>
        </div>
      </div>
      <button type="button" className="btn btn-sm" disabled={!canRemove} onClick={onRemove} title={canRemove ? undefined : t('A gradient needs at least 2 colors')}>
        {t('remove')}
      </button>
    </div>
  );
}

/** Paste colors (e.g. a palette) to make a gradient of them. */
function FromColors({ onStops }: { onStops: (stops: Stop[]) => void }) {
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const use = () => {
    const stops = stopsFromText(text);
    setBad(!stops.length);
    if (stops.length) onStops(stops);
  };
  return (
    <div className="field gr-from">
      <label className="field-label" htmlFor="gr-from">
        {t('From your own colors')}
      </label>
      <div className="gr-from-row">
        <input
          id="gr-from"
          className="input mono"
          value={text}
          spellCheck={false}
          placeholder="#ff7e5f, #feb47b, #86a8e7" /* i18n-ignore */
          aria-invalid={bad || undefined}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && use()}
        />
        <button type="button" className="btn" onClick={use} disabled={!text.trim()}>
          {t('use')}
        </button>
      </div>
      <p className={bad ? 'note error-text' : 'note'}>{bad ? t('Put in at least 2 colors.') : t('Paste 2 or more colors, for example the HEX list from Palette from image.')}</p>
    </div>
  );
}
