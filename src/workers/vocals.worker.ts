/// <reference lib="webworker" />
/**
 * The vocal remover's AI: UVR-MDX-NET Inst HQ 3 (see tools/audio/vocals/model.ts) run with
 * onnxruntime-web, on the graphics card (WebGPU) when the browser has it, otherwise on the
 * processor. The song goes through in pieces of 5.9 s: each piece becomes a spectrogram, the model
 * gives the spectrogram of the music alone, and that is turned back into sound. The singing is
 * what's left when the music is taken away from the song (done by the page).
 */
import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { CHUNK, MODEL, STEP, TRIM } from '../tools/audio/vocals/model';
import { makeStft } from '../tools/audio/vocals/stft';
import { applyLang, t, type Lang } from '../lib/i18n-core';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
ort.env.logLevel = 'error';
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
type Backend = 'webgpu' | 'wasm';
let session: { s: ort.InferenceSession; backend: Backend } | null = null;
let model: Uint8Array | null = null;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const status = (text: string) => ctx.postMessage({ type: 'status', text });

/** The model's bytes: from the cache, or downloaded (with progress), checked and cached. */
async function modelBytes(): Promise<Uint8Array> {
  const cache = await caches.open(MODEL.cache);
  for (const old of await cache.keys()) if (old.url !== MODEL.url) await cache.delete(old);
  const hit = await cache.match(MODEL.url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(MODEL.url);
  if (!res.ok || !res.body) throw new Error(t('Downloading the AI model failed ({status}). Check the internet connection.', { status: res.status }));
  const total = Number(res.headers.get('content-length')) || MODEL.size;
  const buf = new Uint8Array(Math.max(total, MODEL.size));
  let loaded = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf.set(value, loaded);
    loaded += value.length;
    ctx.postMessage({ type: 'download', loaded, total });
  }
  const bytes = buf.subarray(0, loaded);
  status(t('Checking the download…'));
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== MODEL.sha256) throw new Error(t('The downloaded AI model doesn\'t match its checksum. Try again.'));
  await cache.put(MODEL.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  return bytes;
}

async function open(backend: Backend) {
  model ??= await modelBytes();
  status(backend === 'webgpu' ? t('Starting the AI on the graphics card…') : t('Starting the AI on the processor…'));
  const s = await ort.InferenceSession.create(model, { executionProviders: [backend] });
  session = { s, backend };
  return session;
}

async function getSession() {
  if (session) return session;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu && (await gpu.requestAdapter().catch(() => null))) {
    try {
      return await open('webgpu');
    } catch {
      /* this graphics card can't: the processor it is */
    }
  }
  return open('wasm');
}

const { dimF, dimT, nFft, hop } = MODEL;
const PLANE = dimF * dimT;

async function infer(spec: Float32Array) {
  const { s } = await getSession();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', spec, [1, 4, dimF, dimT]) });
  return out[s.outputNames[0]].data as Float32Array;
}

/** The music of a stereo song, without the singing. */
async function separate(left: Float32Array, right: Float32Array) {
  const n = left.length;
  const stft = makeStft(nFft, hop, dimF, dimT);
  const pieces = Math.max(1, Math.ceil(n / STEP));
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const wave = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
  const back = new Float32Array(CHUNK);
  // Two channels, each a real and an imaginary plane: left re, left im, right re, right im.
  const spec = new Float32Array(4 * PLANE);
  await getSession();
  const started = performance.now();
  ctx.postMessage({ type: 'progress', done: 0, total: pieces, backend: session!.backend, ms: 0 });

  for (let p = 0; p < pieces; p++) {
    // A piece starts TRIM samples before its part of the song (silence before the start and after the end).
    const from = p * STEP - TRIM;
    [left, right].forEach((src, ch) => {
      const w = wave[ch];
      for (let i = 0; i < CHUNK; i++) {
        const k = from + i;
        w[i] = k >= 0 && k < n ? src[k] : 0;
      }
      stft.forward(w, spec, ch * 2 * PLANE);
    });

    let result: Float32Array;
    try {
      result = await infer(spec);
    } catch (e) {
      // Some graphics cards start the model but fail running it: do it on the processor instead.
      if (session?.backend !== 'webgpu') throw e;
      await session.s.release().catch(() => {});
      session = null;
      await open('wasm');
      result = await infer(spec);
    }

    [outL, outR].forEach((dst, ch) => {
      stft.inverse(result, ch * 2 * PLANE, back);
      const to = p * STEP;
      const count = Math.min(STEP, n - to);
      for (let i = 0; i < count; i++) dst[to + i] = back[TRIM + i] * MODEL.compensate;
    });
    ctx.postMessage({ type: 'progress', done: p + 1, total: pieces, backend: session!.backend, ms: Math.round(performance.now() - started) });
  }
  return { left: outL, right: outR, backend: session!.backend, ms: Math.round(performance.now() - started) };
}

ctx.onmessage = async (e: MessageEvent<{ id: number; left: Float32Array; right: Float32Array; lang: Lang }>) => {
  try {
    await applyLang(e.data.lang).catch(() => {});
    const r = await separate(e.data.left, e.data.right);
    ctx.postMessage({ type: 'done', id: e.data.id, ...r }, [r.left.buffer, r.right.buffer]);
  } catch (err) {
    ctx.postMessage({ type: 'error', id: e.data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
