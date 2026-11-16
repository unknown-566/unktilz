// i18n-ignore-file: storage keys and ids
import { useSyncExternalStore } from 'react';

/**
 * The timer, the stopwatch and the pomodoro live here, outside the page: they keep running while
 * you use other tools, and the alarm still rings. Everything is counted from timestamps, so a
 * background tab (where timers are slowed down) and a reload don't lose time.
 */

export type Phase = 'work' | 'short' | 'long';
export type PomoSettings = { work: number; short: number; long: number; every: number; auto: boolean };

export type ClockState = {
  timer: { total: number; end: number | null; left: number; done: boolean };
  sw: { start: number | null; acc: number; laps: number[] };
  pomo: { phase: Phase; works: number; end: number | null; left: number; settings: PomoSettings; today: number; day: string; done: boolean };
  sound: boolean;
  notify: boolean;
};

const KEY = 'unktilz-clock';
const MIN = 60_000;
const today = () => new Date().toDateString();

export const POMO_DEFAULTS: PomoSettings = { work: 25, short: 5, long: 15, every: 4, auto: false };

const fresh = (): ClockState => ({
  timer: { total: 5 * MIN, end: null, left: 5 * MIN, done: false },
  sw: { start: null, acc: 0, laps: [] },
  pomo: { phase: 'work', works: 0, end: null, left: 25 * MIN, settings: POMO_DEFAULTS, today: 0, day: today(), done: false },
  sound: true,
  notify: false,
});

function load(): ClockState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ClockState | null;
    if (!s?.timer) return fresh();
    const base = fresh();
    const st: ClockState = { ...base, ...s, timer: { ...base.timer, ...s.timer }, sw: { ...base.sw, ...s.sw }, pomo: { ...base.pomo, ...s.pomo, settings: { ...POMO_DEFAULTS, ...s.pomo?.settings } } };
    if (st.pomo.day !== today()) st.pomo = { ...st.pomo, today: 0, day: today() };
    return st;
  } catch {
    return fresh();
  }
}

let state: ClockState = typeof localStorage === 'undefined' ? fresh() : load();
const listeners = new Set<() => void>();

function commit(next: ClockState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* not kept */
  }
  listeners.forEach((l) => l());
  schedule();
}

export const useClock = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export const getClock = () => state;

// ---------------------------------------------------------------------------------------------
// Ringing: a few short beeps (made, not a sound file), and a notification when the tab is hidden.

let audio: AudioContext | null = null;
/** Called from a click (Start), so the browser lets the page make sound later. */
export function unlockSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no Web Audio */
  }
}

export function beep(times = 3) {
  if (!state.sound) return;
  unlockSound();
  const ctx = audio;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < times; i++)
    for (const [j, f] of [880, 1175].entries()) {
      const at = t0 + i * 0.7 + j * 0.16;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.16);
    }
}

let ring: ((title: string, body: string) => void) | null = null;
/** The page tells the clock how to say "done" in the current language. */
export const onRing = (fn: typeof ring) => (ring = fn);

function alarm(title: string, body: string) {
  beep();
  ring?.(title, body);
  if (state.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(title, { body, tag: 'unktilz-clock' });
    } catch {
      /* some browsers only allow it from a service worker */
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The tick: only while something runs.

let timer = 0;
let texts = { timerDone: 'Time is up', work: 'Time for a break', rest: 'Back to work' };
export const setTexts = (x: typeof texts) => (texts = x);

function schedule() {
  const running = state.timer.end !== null || state.pomo.end !== null;
  if (running && !timer) timer = window.setInterval(tick, 250);
  if (!running && timer) {
    clearInterval(timer);
    timer = 0;
  }
}

function tick() {
  const now = Date.now();
  let next = state;
  if (next.timer.end !== null && now >= next.timer.end) {
    next = { ...next, timer: { ...next.timer, end: null, left: 0, done: true } };
    alarm(texts.timerDone, '');
  }
  if (next.pomo.end !== null && now >= next.pomo.end) {
    const p = next.pomo;
    const wasWork = p.phase === 'work';
    const works = wasWork ? p.works + 1 : p.works;
    const phase: Phase = wasWork ? (works % p.settings.every === 0 ? 'long' : 'short') : 'work';
    const left = p.settings[phase] * MIN;
    next = {
      ...next,
      pomo: { ...p, phase, works, left, end: p.settings.auto ? now + left : null, today: wasWork ? p.today + 1 : p.today, done: !p.settings.auto },
    };
    alarm(wasWork ? texts.work : texts.rest, '');
  }
  if (next !== state) commit(next);
  else listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') schedule();

// ---------------------------------------------------------------------------------------------
// Actions.

export const timerLeft = (s = state) => (s.timer.end !== null ? Math.max(0, s.timer.end - Date.now()) : s.timer.left);
export const pomoLeft = (s = state) => (s.pomo.end !== null ? Math.max(0, s.pomo.end - Date.now()) : s.pomo.left);
export const swTime = (s = state) => s.sw.acc + (s.sw.start !== null ? performance.now() - s.sw.start : 0);

export const timer$ = {
  set(ms: number) {
    commit({ ...state, timer: { total: ms, end: null, left: ms, done: false } });
  },
  start() {
    unlockSound();
    const left = state.timer.left > 0 ? state.timer.left : state.timer.total;
    commit({ ...state, timer: { ...state.timer, left, end: Date.now() + left, done: false } });
  },
  pause() {
    commit({ ...state, timer: { ...state.timer, left: timerLeft(), end: null } });
  },
  reset() {
    commit({ ...state, timer: { ...state.timer, end: null, left: state.timer.total, done: false } });
  },
  add(ms: number) {
    const t = state.timer;
    if (t.end !== null) commit({ ...state, timer: { ...t, end: t.end + ms, total: t.total + ms } });
    else commit({ ...state, timer: { ...t, left: t.left + ms, total: t.done ? ms : t.total + ms, done: false } });
  },
};

// The stopwatch uses performance.now() (it doesn't jump when the computer's clock changes), so a
// running stopwatch is stopped by a reload: the time so far is kept.
if (state.sw.start !== null) state = { ...state, sw: { ...state.sw, start: null } };

export const sw$ = {
  start() {
    commit({ ...state, sw: { ...state.sw, start: performance.now() } });
  },
  pause() {
    commit({ ...state, sw: { ...state.sw, acc: swTime(), start: null } });
  },
  reset() {
    commit({ ...state, sw: { start: null, acc: 0, laps: [] } });
  },
  lap() {
    commit({ ...state, sw: { ...state.sw, laps: [...state.sw.laps, swTime()] } });
  },
};

export const pomo$ = {
  start() {
    unlockSound();
    commit({ ...state, pomo: { ...state.pomo, end: Date.now() + pomoLeft(), done: false } });
  },
  pause() {
    commit({ ...state, pomo: { ...state.pomo, left: pomoLeft(), end: null } });
  },
  /** Ends this phase now and goes to the next one (without ringing). */
  skip() {
    const p = state.pomo;
    const wasWork = p.phase === 'work';
    const works = wasWork ? p.works + 1 : p.works;
    const phase: Phase = wasWork ? (works % p.settings.every === 0 ? 'long' : 'short') : 'work';
    commit({ ...state, pomo: { ...p, phase, works, left: p.settings[phase] * MIN, end: null, done: false } });
  },
  reset() {
    const p = state.pomo;
    commit({ ...state, pomo: { ...p, phase: 'work', works: 0, left: p.settings.work * MIN, end: null, done: false } });
  },
  settings(next: Partial<PomoSettings>) {
    const p = state.pomo;
    const settings = { ...p.settings, ...next };
    // A phase that hasn't started takes the new length at once.
    const untouched = p.end === null && p.left === p.settings[p.phase] * MIN;
    commit({ ...state, pomo: { ...p, settings, left: untouched ? settings[p.phase] * MIN : p.left } });
  },
};

export const setSound = (on: boolean) => commit({ ...state, sound: on });
export const setNotify = (on: boolean) => commit({ ...state, notify: on });
