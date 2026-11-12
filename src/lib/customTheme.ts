// Own themes: the whole set of colors worked out from four main ones (background, panels, text, accent).

import { clampRgb, contrast, fromHex, luminance, oklabToRgb, oklchToRgb, rgbToOklab, rgbToOklch, textOn, to255, toHex, type RGB } from './color';
import { THEME_VARS, type CustomTheme, type Theme, type ThemeVar } from './theme';

/** The colors picked directly; everything else follows from them unless set by hand. */
export const MAIN_VARS = ['--bg', '--surface', '--fg', '--accent'] as const satisfies readonly ThemeVar[];
/** The colors that can be set by hand under "more colors". */
export const MORE_VARS = ['--line', '--muted', '--accent-text', '--on-accent', '--danger', '--warn', '--info'] as const satisfies readonly ThemeVar[];

/** Status colors that read well on a dark or a light page (the Dark and Light themes' own). */
const STATUS: Record<'dark' | 'light', Partial<Record<ThemeVar, string>>> = {
  dark: { '--danger': '#ff8a7a', '--warn': '#ffb020', '--on-warn': '#000', '--info': '#7cc4ff' },
  light: { '--danger': '#b42318', '--warn': '#b26a00', '--on-warn': '#fff', '--info': '#1d6fb8' },
};

/** A color written in CSS (hex or rgb()/rgba()) as RGB, or null. */
export function cssColor(v: string | undefined): RGB | null {
  if (!v) return null;
  const hex = fromHex(v);
  if (hex) return hex;
  const m = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return m ? { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255 } : null;
}

/** a → b, mixed in OKLab (so halfway looks halfway). */
export function mixOk(a: RGB, b: RGB, t: number): RGB {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return clampRgb(oklabToRgb([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]));
}

const rgba = (c: RGB, a: number) => {
  const [r, g, b] = to255(c);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** The accent made lighter or darker (same hue) until it reads on the background (4.5:1), for links and accent text. */
export function readableOn(accent: RGB, bg: RGB, min = 4.5): RGB {
  if (contrast(accent, bg) >= min) return accent;
  const [l, c, h] = rgbToOklch(accent);
  const dir = luminance(bg) < 0.4 ? 1 : -1;
  for (let step = 1; step <= 100; step++) {
    const next = clampRgb(oklchToRgb(Math.min(1, Math.max(0, l + dir * step * 0.01)), c, h));
    if (contrast(next, bg) >= min) return next;
  }
  return textOn(bg);
}

export const isDark = (bg: RGB) => luminance(bg) < 0.4;

/**
 * Works the theme's other colors out again from its main ones. Colors set by hand (`fixed`) stay;
 * the status colors stay too unless the page turned from dark to light or back.
 */
export function derive(theme: CustomTheme): CustomTheme {
  const v = theme.vars;
  const bg = cssColor(v['--bg']) ?? { r: 0, g: 0, b: 0 };
  const surface = cssColor(v['--surface']) ?? bg;
  const fg = cssColor(v['--fg']) ?? textOn(bg);
  const accent = cssColor(v['--accent']) ?? fg;
  const base = isDark(bg) ? 'dark' : 'light';
  const fixed = new Set(theme.fixed ?? []);
  const out: Record<ThemeVar, string> = {
    ...v,
    '--line': toHex(mixOk(surface, fg, 0.13)),
    '--chip-line': toHex(mixOk(surface, fg, 0.16)),
    '--muted': toHex(mixOk(fg, bg, 0.38)),
    '--accent-text': toHex(readableOn(accent, bg)),
    '--on-accent': toHex(textOn(accent)),
    '--grid': rgba(fg, 0.06),
    '--grid-major': rgba(fg, 0.085),
    '--rail-shadow': `0 12px 40px rgba(0, 0, 0, ${base === 'dark' ? 0.45 : 0.18})`,
    ...(base !== theme.base ? STATUS[base] : {}),
  };
  const warn = cssColor(fixed.has('--warn') ? v['--warn'] : out['--warn']);
  if (warn) out['--on-warn'] = toHex(textOn(warn));
  for (const k of fixed) out[k] = v[k];
  return { ...theme, base, vars: out };
}

/** A built-in theme's colors, read from styles.css through a hidden element that carries it. */
export function themeVars(theme: Theme): { base: 'dark' | 'light'; vars: Record<ThemeVar, string> } {
  const el = document.createElement('span');
  el.dataset.theme = theme;
  el.hidden = true;
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const vars = Object.fromEntries(THEME_VARS.map((k) => [k, cs.getPropertyValue(k).trim()])) as Record<ThemeVar, string>;
  const scheme = cs.colorScheme;
  el.remove();
  return { base: scheme === 'light' ? 'light' : 'dark', vars };
}
