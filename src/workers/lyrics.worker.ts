/// <reference lib="webworker" />
/**
 * Finds the words of a song and when each one is sung: OpenAI's Whisper (MIT) run with
 * Transformers.js (Apache-2.0), on the graphics card when the browser has WebGPU, otherwise on the
 * processor. It listens to the vocals alone (the vocal remover's stem), which it reads far better
 * than the whole song. The model downloads once from Hugging Face and stays in the browser.
 *
 * The song goes through in pieces of up to 28 s, cut where the singing is quietest, so no word is
 * cut in half and the progress can be shown.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
// Transformers.js would load onnxruntime's .wasm from a CDN; these are the same files, served by this site.
import wasmUrl from '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsUrl from '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url';
import { applyLang, t, type Lang } from '../lib/i18n-core';
import { LYRICS_MODELS, LYRICS_RATE, type LyricsQuality, type Word } from '../tools/audio/vocals/lyrics';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(mjsUrl, self.location.href).href };
  onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
}

type Backend = 'webgpu' | 'wasm';
let loaded: { asr: AutomaticSpeechRecognitionPipeline; quality: LyricsQuality; backend: Backend } | null = null;

const status = (text: string) => ctx.postMessage({ type: 'status', text });

async function open(quality: LyricsQuality, backend: Backend) {
  // Several files download at once: the bar shows all of them together.
  const files = new Map<string, { loaded: number; total: number }>();
  const asr = await pipeline('automatic-speech-recognition', LYRICS_MODELS[quality].id, {
    device: backend,
    // On the graphics card the listening half must be full precision; the processor takes the small 8-bit files.
    dtype: backend === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : { encoder_model: 'q8', decoder_model_merged: 'q8' },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let a = 0;
      let b = 0;
      for (const f of files.values()) {
        a += f.loaded;
        b += f.total;
      }
      ctx.postMessage({ type: 'download', loaded: a, total: b });
    },
  });
  loaded = { asr: asr as AutomaticSpeechRecognitionPipeline, quality, backend };
  return loaded;
}

async function getModel(quality: LyricsQuality) {
  if (loaded?.quality === quality) return loaded;
  if (loaded) await loaded.asr.dispose().catch(() => {});
  loaded = null;
  status(t('Getting the speech model ready…'));
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu && (await gpu.requestAdapter().catch(() => null))) {
    try {
      return await open(quality, 'webgpu');
    } catch {
      /* this graphics card can't: the processor it is */
    }
  }
  return open(quality, 'wasm');
}

const MAX_PIECE = 28 * LYRICS_RATE;
const LOOK_BACK = 6 * LYRICS_RATE;

/** Where to cut the song: at most 28 s apart, at the quietest moment of the last 6 s of each piece. */
function cuts(audio: Float32Array) {
  const out = [0];
  const win = Math.round(0.05 * LYRICS_RATE);
  while (audio.length - out[out.length - 1] > MAX_PIECE) {
    const end = out[out.length - 1] + MAX_PIECE;
    let best = end;
    let quiet = Infinity;
    for (let i = end - LOOK_BACK; i + win <= end; i += win) {
      let e = 0;
      for (let k = 0; k < win; k++) e += audio[i + k] * audio[i + k];
      if (e < quiet) {
        quiet = e;
        best = i + (win >> 1);
      }
    }
    out.push(best);
  }
  out.push(audio.length);
  return out;
}

/** Nothing is sung in a piece this quiet: Whisper would make words up for it. */
const silent = (a: Float32Array) => {
  let e = 0;
  for (let i = 0; i < a.length; i += 4) e += a[i] * a[i];
  return Math.sqrt(e / Math.max(1, a.length / 4)) < 0.004;
};

async function run(audio: Float32Array, quality: LyricsQuality, language: string) {
  const m = await getModel(quality);
  const at = cuts(audio);
  const total = at.length - 1;
  const words: Word[] = [];
  const started = performance.now();
  ctx.postMessage({ type: 'progress', done: 0, total, backend: m.backend, ms: 0 });
  for (let p = 0; p < total; p++) {
    const piece = audio.subarray(at[p], at[p + 1]);
    const offset = at[p] / LYRICS_RATE;
    if (!silent(piece)) {
      const out = (await m.asr(piece, { return_timestamps: 'word', task: 'transcribe', ...(language === 'auto' ? {} : { language }) })) as { chunks?: { text: string; timestamp: [number | null, number | null] }[] };
      for (const c of out.chunks ?? []) {
        const text = c.text.trim();
        const [a, b] = c.timestamp;
        if (!text || a === null) continue;
        const start = offset + a;
        const end = offset + (b ?? a + 0.3);
        // A "word" that lasts no time, or longer than anyone holds one, is the model guessing.
        if (end - start < 0.02 || end - start > 8) continue;
        words.push({ text, start, end });
      }
    }
    ctx.postMessage({ type: 'progress', done: p + 1, total, backend: m.backend, ms: Math.round(performance.now() - started) });
  }
  return { words, backend: m.backend, ms: Math.round(performance.now() - started) };
}

ctx.onmessage = async (e: MessageEvent<{ id: number; audio: Float32Array; quality: LyricsQuality; language: string; lang: Lang }>) => {
  try {
    await applyLang(e.data.lang).catch(() => {});
    const r = await run(e.data.audio, e.data.quality, e.data.language);
    ctx.postMessage({ type: 'done', id: e.data.id, ...r });
  } catch (err) {
    ctx.postMessage({ type: 'error', id: e.data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
