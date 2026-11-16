import { useEffect, useRef, useState } from 'react';
import { wavePeaks, type Mute, type Stereo } from './separate';
import { t } from '../../../lib/i18n-core';

type Props = {
  label: string;
  sound: Stereo;
  duration: number;
  /** Where playback is now, in seconds (read every frame while playing). */
  now: () => number;
  playing: boolean;
  /** Switched off or silent: drawn faded. */
  off: boolean;
  onSeek: (seconds: number) => void;
  /** Stretches switched off (the singing only), and what a drag across the wave does. */
  mutes?: Mute[];
  onMute?: (start: number, end: number) => void;
};

/**
 * One stem's wave: a click moves the playhead; on the singing, a drag switches that stretch off.
 * The wave takes the color of its row (currentColor), so it follows the theme.
 */
export function StemWave({ label, sound, duration, now, playing, off, onSeek, mutes = [], onMute }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const press = useRef<{ x: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // The wave itself, redrawn when the sound or the size changes.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = c.clientHeight;
    c.width = Math.round(width * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    const { min, max } = wavePeaks(sound, c.width);
    let top = 0.05;
    for (let x = 0; x < c.width; x++) top = Math.max(top, -min[x], max[x]);
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = getComputedStyle(c).color;
    const mid = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      const a = mid - (max[x] / top) * (mid - 1);
      const b = mid - (min[x] / top) * (mid - 1);
      g.fillRect(x, a, 1, Math.max(1, b - a));
    }
  }, [sound, width]);

  // The playhead follows the sound.
  useEffect(() => {
    const place = () => {
      if (head.current && duration > 0) head.current.style.transform = `translateX(${(Math.min(duration, now()) / duration) * width}px)`;
    };
    place();
    if (!playing) return;
    let id = requestAnimationFrame(function tick() {
      place();
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, now, duration, width]);

  const at = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return (Math.max(0, Math.min(r.width, clientX - r.left)) / r.width) * duration;
  };
  const px = (seconds: number) => (duration > 0 ? (seconds / duration) * width : 0);

  return (
    <div
      ref={box}
      className={`vr-wave${off ? ' off' : ''}${onMute ? ' can-mute' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={t('{name}: position in the song', { name: label })}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(now())}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, now() - 5));
        else if (e.key === 'ArrowRight') onSeek(Math.min(duration, now() + 5));
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { x: e.clientX, moved: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p) return;
        if (!p.moved && Math.abs(e.clientX - p.x) < 5) return;
        p.moved = true;
        if (onMute) setDrag({ from: at(p.x), to: at(e.clientX) });
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        if (!p) return;
        if (p.moved && onMute) {
          const a = at(p.x);
          const b = at(e.clientX);
          if (Math.abs(b - a) > 0.03) onMute(Math.min(a, b), Math.max(a, b));
        } else onSeek(at(e.clientX));
        setDrag(null);
      }}
      onPointerCancel={() => {
        press.current = null;
        setDrag(null);
      }}
    >
      <canvas ref={canvas} aria-hidden="true" />
      {mutes.map((m, i) => (
        <span key={i} className="vr-muted" style={{ left: px(m.start), width: Math.max(2, px(m.end) - px(m.start)) }} aria-hidden="true" />
      ))}
      {drag && <span className="vr-muted drawing" style={{ left: px(Math.min(drag.from, drag.to)), width: Math.abs(px(drag.to) - px(drag.from)) }} aria-hidden="true" />}
      <span ref={head} className="vr-head" aria-hidden="true" />
    </div>
  );
}
