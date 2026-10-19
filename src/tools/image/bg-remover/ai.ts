import { MODEL } from './model';

/** What the AI worker reports while it works. */
export type AiEvent = { type: 'download'; loaded: number; total: number } | { type: 'status'; text: string };
export type AiResult = { prob: Float32Array; backend: 'webgpu' | 'wasm'; ms: number };

let worker: Worker | null = null;
let seq = 0;

/** Whether the model is already in the browser (no 115 MB download needed). */
export async function modelReady() {
  try {
    return !!(await (await caches.open(MODEL.cache)).match(MODEL.url));
  } catch {
    return false;
  }
}

/** Finds the subject: the chance (0…1) of each pixel of a 1024×1024 square being part of it. */
export function findSubject(bitmap: ImageBitmap, onEvent: (e: AiEvent) => void): Promise<AiResult> {
  worker ??= new Worker(new URL('../../../workers/bgremove.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'download' || d.type === 'status') return onEvent(d);
      if (d.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (d.type === 'done') resolve({ prob: d.prob, backend: d.backend, ms: d.ms });
      else reject(new Error(d.message));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener(
      'error',
      (e) => {
        w.removeEventListener('message', onMessage);
        worker = null;
        reject(new Error(e.message || 'The AI stopped working.'));
      },
      { once: true },
    );
    w.postMessage({ id, bitmap }, [bitmap]);
  });
}

/** Frees the AI (its model takes a few hundred MB while loaded). */
export function releaseAi() {
  worker?.terminate();
  worker = null;
}
