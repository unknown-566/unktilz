// Sends jobs to the crypto worker. cancel() ends the worker (Argon2 or a big file can't be
// interrupted from inside), and the next job starts a fresh one.
import { getLang, t } from '../../../lib/i18n-core';
import type { Kdf, PwCipher, RawAlgo } from './encrypt';
import type { HashId } from './hashList';
import type { PwAlgo, PwParams } from './passwords';

export type CryptoJob =
  | { type: 'hash'; data: Uint8Array | Blob; algos: HashId[]; hmacKey?: Uint8Array }
  | { type: 'pw-hash'; algo: PwAlgo; password: string; params: PwParams }
  | { type: 'pw-verify'; password: string; hash: string }
  | { type: 'encrypt'; data: Uint8Array; password: string; format: PwCipher | 'openssl'; kdf: Kdf; iterations: number }
  | { type: 'decrypt'; data: Uint8Array; password: string; iterations: number }
  | { type: 'raw'; algo: RawAlgo; key: Uint8Array; nonce: Uint8Array; data: Uint8Array; decrypt: boolean };

type Reply = { id: number; type: 'progress'; value: number } | { id: number; type: 'done'; result: unknown } | { id: number; type: 'error'; message: string };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: Reply) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Reply>) => waiting.get(e.data.id)?.(e.data);
    worker.onerror = (e) => {
      for (const [id, fn] of waiting) fn({ id, type: 'error', message: e.message || t('Worker crashed.') });
    };
  }
  return worker;
}

export class Cancelled extends Error {}

export function cryptoJob<T>(job: CryptoJob, onProgress?: (p: number) => void): { done: Promise<T>; cancel: () => void } {
  const id = ++seq;
  let fail: (e: Error) => void = () => {};
  const done = new Promise<T>((resolve, reject) => {
    fail = reject;
    waiting.set(id, (r) => {
      if (r.type === 'progress') return onProgress?.(r.value);
      waiting.delete(id);
      if (r.type === 'error') reject(new Error(r.message));
      else resolve(r.result as T);
    });
  });
  getWorker().postMessage({ id, job, lang: getLang() });
  const cancel = () => {
    if (!waiting.has(id)) return;
    waiting.delete(id);
    worker?.terminate();
    worker = null;
    // Other jobs on that worker are gone too.
    for (const [other, fn] of [...waiting]) fn({ id: other, type: 'error', message: t('Interrupted, please try again.') });
    fail(new Cancelled());
  };
  return { done, cancel };
}
