import { RATE, type Backend, type Mute, type Stereo } from './separate';
import { getLang, t } from '../../../lib/i18n-core';

/** A sung word and when it is sung, in seconds of the song. */
export type Word = { text: string; start: number; end: number };
export type LyricsQuality = 'fast' | 'better';

/** Whisper listens at this rate, in mono. */
export const LYRICS_RATE = 16000;

/**
 * OpenAI's Whisper (MIT), the exports with word times from the onnx-community on Hugging Face.
 * `size` is roughly what is downloaded on a graphics card (the processor gets smaller files).
 */
export const LYRICS_MODELS: Record<LyricsQuality, { id: string; size: number }> = {
  fast: { id: 'onnx-community/whisper-base_timestamped', size: 206_000_000 },
  better: { id: 'onnx-community/whisper-small_timestamped', size: 586_000_000 },
};

/** Languages offered for the song (Whisper knows about a hundred; "auto" lets it guess). */
export const LYRICS_LANGUAGES = ['auto', 'en', 'cs', 'sk', 'de', 'es', 'fr', 'it', 'pl', 'pt', 'ru', 'uk', 'ja', 'ko'] as const; // i18n-ignore

export type LyricsEvent =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'status'; text: string }
  | { type: 'progress'; done: number; total: number; backend: Backend; ms: number };

/** The vocals as Whisper wants them: one channel at 16 kHz. */
export async function forWhisper(vocals: Stereo): Promise<Float32Array> {
  const n = vocals.left.length;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil((n * LYRICS_RATE) / RATE)), LYRICS_RATE);
  const buf = ctx.createBuffer(1, n, RATE);
  const mono = buf.getChannelData(0);
  for (let i = 0; i < n; i++) mono[i] = (vocals.left[i] + vocals.right[i]) / 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  return new Float32Array((await ctx.startRendering()).getChannelData(0));
}

let worker: Worker | null = null;
let stopper: (() => void) | null = null;
let seq = 0;

/** Finds the words in the vocals. `stopLyrics()` ends it early. */
export function findWords(audio: Float32Array, quality: LyricsQuality, language: string, onEvent: (e: LyricsEvent) => void): Promise<{ words: Word[]; backend: Backend; ms: number }> {
  worker ??= new Worker(new URL('../../../workers/lyrics.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'download' || d.type === 'status' || d.type === 'progress') return onEvent(d);
      if (d.id !== id) return;
      w.removeEventListener('message', onMessage);
      stopper = null;
      if (d.type === 'done') resolve({ words: d.words, backend: d.backend, ms: d.ms });
      else reject(new Error(d.message));
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
    w.postMessage({ id, audio, quality, language, lang: getLang() }, [audio.buffer]);
  });
}

export const stopLyrics = () => {
  stopper?.();
  stopper = null;
};

export function releaseLyrics() {
  worker?.terminate();
  worker = null;
  stopper = null;
}

/** A word without its punctuation and capitals, for "switch this word off everywhere". */
export const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, '');

/** A little before and after a word goes too, so its first and last sound don't stick out. */
const PAD = 0.05;
export const wordMute = (w: Word): Mute => ({ start: Math.max(0, w.start - PAD), end: w.end + PAD });
