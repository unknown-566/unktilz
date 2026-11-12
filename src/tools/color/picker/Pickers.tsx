import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Segmented } from '../../../components/ui';
import { clampRgb, cmykToRgb, from255, hslToRgb, hsvToRgb, inGamut, oklchToRgb, rgbToCmyk, rgbToHsl, rgbToHsv, rgbToOklch, to255, toHex, type RGB } from '../../../lib/color';
import { t } from '../../../lib/i18n-core';

/** Dragging inside an element: the pointer's place as 0…1 across and down. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return {
    ref,
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    },
    onPointerMove: (e: PointerEvent) => e.currentTarget.hasPointerCapture(e.pointerId) && move(e),
  };
}

/** Arrow keys: 1 step, with Shift 10. */
const arrows = (e: KeyboardEvent, step: (dx: number, dy: number) => void) => {
  const k = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
  if (!d) return;
  e.preventDefault();
  step(d[0], d[1]);
};

/** The big square: saturation across, brightness up, for the current hue. */
export function SvSquare({ h, s, v, onChange }: { h: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const drag = useDrag((x, y) => onChange(x, 1 - y));
  return (
    <div
      {...drag}
      className="cp-sv"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h} 100% 50%)` }}
      role="slider"
      tabIndex={0}
      aria-label={t('Saturation and brightness')}
      aria-valuetext={t('saturation {s} %, brightness {v} %', { s: Math.round(s * 100), v: Math.round(v * 100) })}
      onKeyDown={(e) => arrows(e, (dx, dy) => onChange(Math.min(1, Math.max(0, s + dx / 100)), Math.min(1, Math.max(0, v + dy / 100))))}
    >
      <span className="cp-thumb" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: toHex(hsvToRgb(h, s, v)) }} />
    </div>
  );
}

/** The rainbow strip for the hue. */
export function HueStrip({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const drag = useDrag((x) => onChange(Math.min(359.9, x * 360)));
  return (
    <div
      {...drag}
      className="cp-hue"
      role="slider"
      tabIndex={0}
      aria-label={t('Hue')}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(h)}
      onKeyDown={(e) => arrows(e, (dx, dy) => onChange((((h + dx + dy) % 360) + 360) % 360))}
    >
      <span className="cp-thumb" style={{ left: `${(h / 360) * 100}%`, top: '50%', background: `hsl(${h} 100% 50%)` }} />
    </div>
  );
}

// ---- number sliders in one color space at a time ----

type Space = 'rgb' | 'hsl' | 'hsb' | 'oklch' | 'cmyk';
type Channel = { label: string; max: number; step: number; unit?: string };

const SPACES: Record<Space, { channels: Channel[]; from: (c: RGB, hue: number) => number[]; to: (v: number[]) => RGB }> = {
  rgb: {
    channels: [
      { label: 'R', max: 255, step: 1 },
      { label: 'G', max: 255, step: 1 },
      { label: 'B', max: 255, step: 1 },
    ],
    from: (c) => to255(c),
    to: ([r, g, b]) => from255(r, g, b),
  },
  hsl: {
    channels: [
      { label: 'H', max: 360, step: 1, unit: '°' },
      { label: 'S', max: 100, step: 1, unit: '%' },
      { label: 'L', max: 100, step: 1, unit: '%' },
    ],
    from: (c, hue) => {
      const [h, s, l] = rgbToHsl(c);
      return [s ? h : hue, s * 100, l * 100];
    },
    to: ([h, s, l]) => hslToRgb(h, s / 100, l / 100),
  },
  hsb: {
    channels: [
      { label: 'H', max: 360, step: 1, unit: '°' },
      { label: 'S', max: 100, step: 1, unit: '%' },
      { label: 'B', max: 100, step: 1, unit: '%' },
    ],
    from: (c, hue) => {
      const [h, s, v] = rgbToHsv(c);
      return [s ? h : hue, s * 100, v * 100];
    },
    to: ([h, s, v]) => hsvToRgb(h, s / 100, v / 100),
  },
  oklch: {
    channels: [
      { label: 'L', max: 100, step: 0.1, unit: '%' },
      { label: 'C', max: 0.37, step: 0.001 },
      { label: 'H', max: 360, step: 0.1, unit: '°' },
    ],
    from: (c) => {
      const [l, ch, h] = rgbToOklch(c);
      return [l * 100, ch, h];
    },
    to: ([l, c, h]) => oklchToRgb(l / 100, c, h),
  },
  cmyk: {
    channels: [
      { label: 'C', max: 100, step: 1, unit: '%' },
      { label: 'M', max: 100, step: 1, unit: '%' },
      { label: 'Y', max: 100, step: 1, unit: '%' },
      { label: 'K', max: 100, step: 1, unit: '%' },
    ],
    from: (c) => rgbToCmyk(c).map((v) => v * 100),
    to: ([c, m, y, k]) => cmykToRgb(c / 100, m / 100, y / 100, k / 100),
  },
};

const tidy = (v: number, step: number) => {
  const d = step < 0.01 ? 3 : step < 1 ? 1 : 0;
  return Math.round(v * 10 ** d) / 10 ** d;
};

/**
 * Sliders for one color space. The values are kept here while you use them, so a gray keeps its
 * hue and a color outside sRGB keeps what you set (the color itself is clipped).
 */
export function Channels({ color, hue, onChange }: { color: RGB; hue: number; onChange: (c: RGB) => void }) {
  const [space, setSpace] = useState<Space>('rgb');
  const def = SPACES[space];
  const [held, setHeld] = useState(() => ({ space, v: def.from(color, hue) }));
  const mine = (h: typeof held) => h.space === space && toHex(clampRgb(def.to(h.v))) === toHex(color);
  const vals = mine(held) ? held.v : def.from(color, hue);

  // Follow outside changes (the square, typing, the image), but not our own.
  useEffect(() => {
    setHeld((cur) => (mine(cur) ? cur : { space, v: def.from(color, hue) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, space]);

  const out = def.to(vals);
  const clipped = !inGamut(out, 0.002);

  const set = (i: number, v: number) => {
    const next = vals.map((x, j) => (j === i ? Math.min(def.channels[i].max, Math.max(0, v)) : x));
    setHeld({ space, v: next });
    onChange(clampRgb(def.to(next)));
  };

  return (
    <div className="cp-channels">
      <Segmented
        label={t('Color space')}
        compact
        value={space}
        onChange={setSpace}
        options={[
          { value: 'rgb', label: 'RGB' },
          { value: 'hsl', label: 'HSL' },
          { value: 'hsb', label: 'HSB' },
          { value: 'oklch', label: 'OKLCH' },
          { value: 'cmyk', label: 'CMYK' },
        ]}
      />
      {def.channels.map((ch, i) => {
        // The track shows what moving this one slider would give.
        const stops = Array.from({ length: 9 }, (_, k) => toHex(clampRgb(def.to(vals.map((x, j) => (j === i ? (ch.max * k) / 8 : x))))));
        return (
          <label key={`${space}-${ch.label}`} className="cp-channel">
            <span className="mono">{ch.label}</span>
            <input
              className="cp-range"
              type="range"
              min={0}
              max={ch.max}
              step={ch.step}
              value={vals[i] ?? 0}
              style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
              onChange={(e) => set(i, Number(e.target.value))}
            />
            <input className="input mono cp-num" type="number" min={0} max={ch.max} step={ch.step} value={tidy(vals[i] ?? 0, ch.step)} aria-label={ch.label} onChange={(e) => e.target.value !== '' && set(i, Number(e.target.value))} />
            <span className="muted mono cp-unit">{ch.unit ?? ''}</span>
          </label>
        );
      })}
      {clipped && <p className="note">{t('This one is outside what screens show (sRGB), so the nearest color that fits is used.')}</p>}
    </div>
  );
}
