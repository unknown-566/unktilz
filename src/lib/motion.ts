import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './theme';

export { prefersReducedMotion };

const NOISE = 'abcdefghijklmnopqrstuvwxyz0123456789#%&/<>_';

/**
 * Text that "decrypts" from random characters into itself, left to right (about 1 s). Spaces stay
 * spaces, so the line keeps its shape. With reduced motion, or when `run` is false, it's the text at once.
 */
export function useDecrypt(text: string, run = true) {
  const [shown, setShown] = useState(() => (run && !prefersReducedMotion() ? scramble(text, 0) : text));
  useEffect(() => {
    if (!run || prefersReducedMotion()) {
      setShown(text);
      return;
    }
    // About 56 ms per letter, but never longer than ~1.7 s for long titles. Counted from the clock,
    // so a slowed-down timer (tab in the background) only skips steps and still ends on time.
    const perLetter = Math.min(56, 1700 / Math.max(1, text.length));
    const start = performance.now();
    const timer = window.setInterval(() => {
      const done = (performance.now() - start) / perLetter;
      if (done >= text.length) {
        clearInterval(timer);
        setShown(text);
      } else setShown(scramble(text, done));
    }, 28);
    return () => clearInterval(timer);
  }, [text, run]);
  return shown;
}

function scramble(text: string, done: number) {
  let out = '';
  for (let i = 0; i < text.length; i++) out += i < done || text[i] === ' ' ? text[i] : NOISE[Math.floor(Math.random() * NOISE.length)];
  return out;
}

/**
 * A number that counts up from 0 to `to` once (like React Bits' CountUp), easing out, in about
 * `ms`. Counted from the clock, so it ends on time in a background tab too. Reduced motion: at once.
 */
export function useCountUp(to: number, ms = 1200) {
  const [n, setN] = useState(() => (prefersReducedMotion() ? to : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    let timer = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // rAF doesn't run in a hidden tab: make sure the right number is there when it ends.
    timer = window.setTimeout(() => setN(to), ms + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [to, ms]);
  return n;
}

/**
 * A number that glides from the last value to the new one when it changes (a quick count up or
 * down), so changing numbers are easy to follow. Reduced motion or a hidden tab: at once.
 */
export function useTweened(to: number, ms = 450) {
  const [n, setN] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    const start = from.current;
    if (prefersReducedMotion() || document.hidden || start === to) {
      from.current = to;
      setN(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const v = start + (to - start) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setN(Math.round(v));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const timer = window.setTimeout(() => {
      from.current = to;
      setN(to);
    }, ms + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [to, ms]);
  return n;
}

/** For a pointermove on a list of cards: puts the pointer's place inside the card under it into --mx / --my (for the light under the cursor). */
export function spotlight(e: React.PointerEvent) {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}
