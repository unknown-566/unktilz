import { MAX_SECONDS, MODEL } from './model';
import { ffmpegRun } from '../../../lib/ffmpeg';
import { getLang, t } from '../../../lib/i18n-core';

/** A stereo sound at the model's rate. */
export type Stereo = { left: Float32Array; right: Float32Array };
export type Stems = { music: Stereo; vocals: Stereo };
export type Backend = 'webgpu' | 'wasm';
export type SplitEvent =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'status'; text: string }
  | { type: 'progress'; done: number; total: number; backend: Backend; ms: number };

export const RATE = MODEL.sampleRate;

/** Whether the model is already in the browser (no 64 MB download needed). */
export async function modelReady() {
  try {
    return !!(await (await caches.open(MODEL.cache)).match(MODEL.url));
  } catch {
    return false;
  }
}

const decode = (data: ArrayBuffer) => new OfflineAudioContext(2, 1, RATE).decodeAudioData(data);

/**
 * Reads a song (or a video's sound) as stereo at 44.1 kHz. The browser does it when it can;
 * otherwise ffmpeg makes a WAV first.
 */
export async function readSong(file: File, onConvert?: (p: number) => void, signal?: AbortSignal): Promise<Stereo> {
  let buf: AudioBuffer;
  try {
    buf = await decode(await file.arrayBuffer());
  } catch {
    onConvert?.(0);
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
    const input = `in.${ext}`;
    let wav: Uint8Array;
    try {
      [wav] = await ffmpegRun([{ name: input, data: new Uint8Array(await file.arrayBuffer()) }], ['-i', input, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', 'song.wav'], ['song.wav'], { signal, onProgress: onConvert });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(t('This file can’t be opened, or it has no sound.'));
    }
    buf = await decode((wav.buffer as ArrayBuffer).slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  }
  if (!(buf.duration > 0)) throw new Error(t('This file can’t be opened, or it has no sound.'));
  if (buf.duration > MAX_SECONDS) throw new Error(t('This is longer than {n} minutes, which is more than the browser can hold. Cut it shorter first (Audio cutter).', { n: MAX_SECONDS / 60 }));
  const left = new Float32Array(buf.getChannelData(0));
  const right = buf.numberOfChannels > 1 ? new Float32Array(buf.getChannelData(1)) : new Float32Array(left);
  return { left, right };
}

let worker: Worker | null = null;
let seq = 0;

/** Splits a song into the music and the singing with the AI. `stop()` ends it early. */
export function splitWithAi(song: Stereo, onEvent: (e: SplitEvent) => void): Promise<Stems & { backend: Backend; ms: number }> {
  worker ??= new Worker(new URL('../../../workers/vocals.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'download' || d.type === 'status' || d.type === 'progress') return onEvent(d);
      if (d.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (d.type !== 'done') return reject(new Error(d.message));
      const music: Stereo = { left: d.left, right: d.right };
      resolve({ music, vocals: minus(song, music), backend: d.backend, ms: d.ms });
    };
    w.addEventListener('message', onMessage);
    w.addEventListener(
      'error',
      (e) => {
        w.removeEventListener('message', onMessage);
        worker = null;
        reject(new Error(e.message || t('The AI stopped working.')));
      },
      { once: true },
    );
    stopper = () => {
      w.removeEventListener('message', onMessage);
      w.terminate();
      worker = null;
      reject(new DOMException('stopped', 'AbortError'));
    };
    // The worker gets its own copy: the page keeps the song to take the music away from.
    w.postMessage({ id, left: song.left.slice(), right: song.right.slice(), lang: getLang() });
  });
}

let stopper: (() => void) | null = null;
/** Stops a split that is running (the AI is started again next time). */
export const stopSplit = () => {
  stopper?.();
  stopper = null;
};

/** Frees the AI (its model takes a few hundred MB while loaded). */
export function releaseAi() {
  worker?.terminate();
  worker = null;
  stopper = null;
}

const minus = (a: Stereo, b: Stereo): Stereo => {
  const left = new Float32Array(a.left.length);
  const right = new Float32Array(a.left.length);
  for (let i = 0; i < left.length; i++) {
    left[i] = a.left[i] - b.left[i];
    right[i] = a.right[i] - b.right[i];
  }
  return { left, right };
};

/**
 * The quick way, without AI: what is the same in both ears (usually the singer, but also the bass
 * and the kick drum) cancels out when one side is taken away from the other. Mono songs go silent.
 */
export function splitQuick(song: Stereo): Stems {
  const n = song.left.length;
  const side = new Float32Array(n);
  const mid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    side[i] = (song.left[i] - song.right[i]) / 2;
    mid[i] = (song.left[i] + song.right[i]) / 2;
  }
  return { music: { left: side, right: new Float32Array(side) }, vocals: { left: mid, right: new Float32Array(mid) } };
}

/** A stretch of the singing that is switched off, in seconds. */
export type Mute = { start: number; end: number };

/** How long a mute takes to go quiet and to come back, so it doesn't click. */
export const MUTE_FADE = 0.012;

/** What is heard: the music and the singing at their volumes, the singing silent inside the mutes. */
export function mixDown(stems: Stems, musicGain: number, vocalsGain: number, mutes: Mute[]): Stereo {
  const n = stems.music.left.length;
  const env = new Float32Array(n).fill(vocalsGain);
  const fade = Math.round(MUTE_FADE * RATE);
  for (const m of mutes) {
    const a = Math.max(0, Math.round(m.start * RATE));
    const b = Math.min(n, Math.round(m.end * RATE));
    for (let i = Math.max(0, a - fade); i < Math.min(n, b + fade); i++) {
      const k = i < a ? (a - i) / fade : i >= b ? (i - b + 1) / fade : 0;
      env[i] = Math.min(env[i], vocalsGain * k);
    }
  }
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = stems.music.left[i] * musicGain + stems.vocals.left[i] * env[i];
    right[i] = stems.music.right[i] * musicGain + stems.vocals.right[i] * env[i];
  }
  return { left, right };
}

/** A 16-bit WAV file of a stereo sound. */
export function toWav(s: Stereo): Blob {
  const n = s.left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const text = (at: number, str: string) => [...str].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); // i18n-ignore
  v.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt '); // i18n-ignore
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data'); // i18n-ignore
  v.setUint32(40, n * 4, true);
  const out = new Int16Array(buf, 44);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(s.left[i] * 32767)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(s.right[i] * 32767)));
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** The lowest and highest sample of each of `width` slices, for drawing a wave. */
export function wavePeaks(s: Stereo, width: number) {
  const n = s.left.length;
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const per = n / width;
  for (let x = 0; x < width; x++) {
    const a = Math.floor(x * per);
    const b = Math.min(n, Math.max(a + 1, Math.floor((x + 1) * per)));
    let lo = 0;
    let hi = 0;
    // Every few samples is enough for a picture.
    const step = Math.max(1, Math.floor((b - a) / 64));
    for (let i = a; i < b; i += step) {
      const l = s.left[i];
      const r = s.right[i];
      if (l < lo) lo = l;
      if (r < lo) lo = r;
      if (l > hi) hi = l;
      if (r > hi) hi = r;
    }
    min[x] = lo;
    max[x] = hi;
  }
  return { min, max };
}
