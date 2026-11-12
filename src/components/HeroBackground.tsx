import { useEffect, useState } from 'react';
import MicroSlats from './bits/MicroSlats';
import { useTheme } from '../lib/theme';

type Look = { accent: string; fg: string; bg: string };

/** Any CSS color as #rrggbb (MicroSlats reads hex); null when the browser can't read it. */
function toHex(color: string): string | null {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !color) return null;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const v = String(ctx.fillStyle);
  if (v.startsWith('#')) return v;
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((x) => Math.round(parseFloat(x)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The home page hero's background: a wave running over thin slats in the theme's accent color,
 * with a glint that follows the mouse. It stops while off screen or the tab is hidden, and stands
 * still with reduced motion. Without WebGL 2 nothing is drawn and the plain background stays.
 */
export function HeroBackground() {
  const [theme] = useTheme();
  const [look, setLook] = useState<Look | null>(null);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (v: string, fallback: string) => toHex(css.getPropertyValue(v).trim()) ?? fallback;
    setLook({ accent: read('--accent', '#d4ff3f'), fg: read('--fg', '#fafafa'), bg: read('--bg', '#09090b') });
  }, [theme]);

  if (!look) return null;
  return (
    <div className="hero-bg" aria-hidden="true">
      <MicroSlats key={theme} color={look.accent} glintColor={look.fg} backgroundColor={look.bg} cursorStrength={0.8} />
    </div>
  );
}
