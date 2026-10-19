/// <reference lib="webworker" />
/**
 * The background remover's AI: BiRefNet_lite (MIT) run with onnxruntime-web, on the graphics card
 * (WebGPU) when the browser has it, otherwise on the processor (WASM). The model downloads once from
 * Hugging Face, is checked against its published SHA-256 and kept in the browser's Cache Storage.
 */
import * as ort from 'onnxruntime-web/webgpu';
// The WebGPU build of onnxruntime 1.30 runs on its "asyncify" wasm; both files must be that same
// variant, or it hangs while starting.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { MODEL } from '../tools/image/bg-remover/model';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// Its harmless optimisation notes would show up as red errors in the console.
ort.env.logLevel = 'error';
// Several threads need a cross-origin isolated page, which this site isn't.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const SIDE = MODEL.side;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Backend = 'webgpu' | 'wasm';
let session: { s: ort.InferenceSession; backend: Backend } | null = null;
let model: Uint8Array | null = null;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const status = (text: string) => ctx.postMessage({ type: 'status', text });

/** The model's bytes: from the cache, or downloaded (with progress), checked and cached. */
async function modelBytes(): Promise<Uint8Array> {
  const cache = await caches.open(MODEL.cache);
  // Older versions of the model aren't needed any more.
  for (const old of await cache.keys()) if (old.url !== MODEL.url) await cache.delete(old);
  const hit = await cache.match(MODEL.url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(MODEL.url);
  if (!res.ok || !res.body) throw new Error(`Downloading the AI model failed (${res.status}). Check the internet connection.`);
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
  status('Checking the download…');
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== MODEL.sha256) throw new Error("The downloaded AI model doesn't match its checksum. Try again.");
  await cache.put(MODEL.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  return bytes;
}

async function open(backend: Backend) {
  model ??= await modelBytes();
  status(backend === 'webgpu' ? 'Starting the AI on the graphics card…' : 'Starting the AI on the processor…');
  const s = await ort.InferenceSession.create(model, { executionProviders: [backend] });
  session = { s, backend };
  return session;
}

/** A session on the graphics card if it works there, otherwise on the processor. */
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

/** The picture squeezed to the model's square, as the normalised numbers it reads (channels first). */
function input(bitmap: ImageBitmap) {
  const c = new OffscreenCanvas(SIDE, SIDE);
  const g = c.getContext('2d')!;
  g.drawImage(bitmap, 0, 0, SIDE, SIDE);
  const px = g.getImageData(0, 0, SIDE, SIDE).data;
  const n = SIDE * SIDE;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) data[k * n + i] = (px[i * 4 + k] / 255 - MEAN[k]) / STD[k];
  return data;
}

async function infer(data: Float32Array) {
  const { s } = await getSession();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, SIDE, SIDE]) });
  // The finest mask is the last output.
  return out[s.outputNames[s.outputNames.length - 1]].data as Float32Array;
}

async function run(bitmap: ImageBitmap) {
  const data = input(bitmap);
  bitmap.close();
  await getSession();
  status(session!.backend === 'webgpu' ? 'Finding the subject (graphics card)…' : 'Finding the subject (processor, takes a few seconds)…');
  const t = performance.now();
  let raw: Float32Array;
  try {
    raw = await infer(data);
  } catch (e) {
    // Some graphics cards start the model but fail running it: do it on the processor instead.
    if (session?.backend !== 'webgpu') throw e;
    await session.s.release().catch(() => {});
    session = null;
    await open('wasm');
    status('Finding the subject (processor, takes a few seconds)…');
    raw = await infer(data);
  }
  const n = SIDE * SIDE;
  const prob = new Float32Array(raw.length === n ? raw : raw.subarray(raw.length - n));
  // The model gives scores; turn them into 0…1 (unless it already did).
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (prob[i] < min) min = prob[i];
    if (prob[i] > max) max = prob[i];
  }
  if (min < -0.001 || max > 1.001) for (let i = 0; i < n; i++) prob[i] = 1 / (1 + Math.exp(-prob[i]));
  return { prob, backend: session!.backend, ms: Math.round(performance.now() - t) };
}

ctx.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  try {
    const r = await run(e.data.bitmap);
    ctx.postMessage({ type: 'done', id: e.data.id, ...r }, [r.prob.buffer]);
  } catch (err) {
    ctx.postMessage({ type: 'error', id: e.data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
