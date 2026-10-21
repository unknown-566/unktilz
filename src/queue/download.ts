import { getOutputs } from './blobs';
import type { Job } from './store';
import { fmtNum, t } from '../lib/i18n-core';

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

async function zipOutputs(outputs: { name: string; blob: Blob }[]): Promise<Blob> {
  // Zipping is rare (jobs with several results), so the zip library loads only then.
  const { zip } = await import('fflate');
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
  if (!outputs?.length) throw new Error(t('The result is no longer stored. Run the job again.'));
  if (outputs.length === 1) return saveBlob(outputs[0].blob, outputs[0].name);
  const base = job.file.replace(/\.[^.]+$/, '') || job.slug;
  saveBlob(await zipOutputs(outputs), `${base}.zip`);
}

const oneDecimal = (n: number) => fmtNum(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${oneDecimal(n / 1024)} KB` : `${oneDecimal(n / 1024 ** 2)} MB`);

/** 'song.ogg' → 'song.mp3' */
export const swapExt = (name: string, ext: string) => `${name.replace(/\.[^./]+$/, '') || 'file'}.${ext}`;
