import type { RunEvent } from '../registry/types';
import { abortError, channel } from './channel';
import type { FileTaskName, TaskName, TaskPayload, TaskResult } from '../workers/compute.worker';
import { t } from './i18n-core';
import { getLang } from './i18n-core';

type Reply =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string };

// One shared worker for canvas / pdf work. Cancelling terminates the worker and a fresh one is
// made next time, so only one long task should run at once (the queue makes sure of that).
let worker: Worker | null = null;
let seq = 0;
const listeners = new Map<number, (r: Reply) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/compute.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Reply>) => listeners.get(e.data.id)?.(e.data);
    worker.onerror = (e) => {
      for (const [id, fn] of listeners) fn({ id, type: 'error', message: e.message || t('Worker crashed.') });
    };
  }
  return worker;
}

/** Runs a file task for the queue: yields progress, then the produced files. */
export function compute<T extends FileTaskName>(task: T, payload: TaskPayload<T>, signal: AbortSignal): AsyncIterable<RunEvent> {
  const ch = channel<RunEvent>();
  const id = ++seq;
  const w = getWorker();

  const finish = () => {
    listeners.delete(id);
    signal.removeEventListener('abort', onAbort);
  };
  const onAbort = () => {
    finish();
    worker?.terminate();
    worker = null;
    // Anything else waiting on that worker would hang forever; tell it to try again.
    for (const [other, fn] of [...listeners]) fn({ id: other, type: 'error', message: t('Interrupted, please try again.') });
    ch.fail(abortError());
  };

  listeners.set(id, (r) => {
    if (r.type === 'progress') ch.push({ type: 'progress', value: r.value });
    else if (r.type === 'error') {
      finish();
      ch.fail(new Error(r.message));
    } else {
      finish();
      for (const o of r.result as { name: string; blob: Blob }[]) ch.push({ type: 'result', name: o.name, blob: o.blob });
      ch.close();
    }
  });
  signal.addEventListener('abort', onAbort, { once: true });
  w.postMessage({ id, task, payload, lang: getLang() });
  return ch;
}

/** Runs a task for an interactive tool and resolves with its result. */
export function computeValue<T extends TaskName>(task: T, payload: TaskPayload<T>, onProgress?: (p: number) => void): Promise<TaskResult<T>> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    listeners.set(id, (r) => {
      if (r.type === 'progress') onProgress?.(r.value);
      else {
        listeners.delete(id);
        if (r.type === 'error') reject(new Error(r.message));
        else resolve(r.result as TaskResult<T>);
      }
    });
    getWorker().postMessage({ id, task, payload, lang: getLang() });
  });
}
