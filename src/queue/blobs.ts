import { createStore, del, get, set } from 'idb-keyval';

// File bytes live in their own IndexedDB store, written once per job.
// The queue state itself stays small so it can be persisted on every change.
const store = createStore('unktilz-files', 'blobs');

export type Output = { name: string; blob: Blob };

// Inputs are also kept in memory so a freshly added job never waits on IndexedDB.
const memInputs = new Map<string, File[]>();

export async function putInputs(id: string, files: File[]) {
  memInputs.set(id, files);
  try {
    await set(`in:${id}`, files, store);
  } catch {
    // Private mode or quota: the job still runs from memory in this tab.
  }
}

export async function getInputs(id: string): Promise<File[] | undefined> {
  return memInputs.get(id) ?? (await get<File[]>(`in:${id}`, store).catch(() => undefined));
}

export async function dropInputs(id: string) {
  memInputs.delete(id);
  await del(`in:${id}`, store).catch(() => {});
}

const memOutputs = new Map<string, Output[]>();

export async function putOutputs(id: string, outputs: Output[]) {
  memOutputs.set(id, outputs);
  await set(`out:${id}`, outputs, store).catch(() => {});
}

export async function getOutputs(id: string): Promise<Output[] | undefined> {
  return memOutputs.get(id) ?? (await get<Output[]>(`out:${id}`, store).catch(() => undefined));
}

export async function dropAll(id: string) {
  memInputs.delete(id);
  memOutputs.delete(id);
  await Promise.all([del(`in:${id}`, store), del(`out:${id}`, store)]).catch(() => {});
}

/** Abort controllers of running jobs, shared by the store (remove) and the runner. */
export const controllers = new Map<string, AbortController>();
