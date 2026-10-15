import { zip } from 'fflate';
import { getOutputs } from './blobs';
import type { Job } from './store';

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function zipOutputs(outputs: { name: string; blob: Blob }[]): Promise<Blob> {
  return Promise.all(outputs.map(async (o) => [o.name, new Uint8Array(await o.blob.arrayBuffer())] as const)).then(
    (entries) =>
      new Promise((resolve, reject) => {
        const files: Record<string, Uint8Array> = {};
        for (const [name, data] of entries) {
          let n = name;
          for (let i = 2; files[n]; i++) n = name.replace(/(\.[^.]*)?$/, ` (${i})$1`);
          files[n] = data;
        }
        zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(new Blob([data as BlobPart], { type: 'application/zip' }))));
      }),
  );
}

export async function downloadJob(job: Job) {
  const outputs = await getOutputs(job.id);
  if (!outputs?.length) throw new Error('The result is no longer stored. Run the job again.');
  if (outputs.length === 1) return saveBlob(outputs[0].blob, outputs[0].name);
  const base = job.file.replace(/\.[^.]+$/, '') || job.slug;
  saveBlob(await zipOutputs(outputs), `${base}.zip`);
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

/** 'song.ogg' → 'song.mp3' */
export const swapExt = (name: string, ext: string) => `${name.replace(/\.[^./]+$/, '') || 'file'}.${ext}`;
