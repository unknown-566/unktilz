/// <reference lib="webworker" />
// The slow parts of the crypto tool (hashing files, password hashes, encryption) off the page, so
// it doesn't freeze. Stopping a job ends this worker; the page makes a new one.
import { applyLang, type Lang } from '../../../lib/i18n-core';
import type { CryptoJob } from './cryptoClient';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

async function run(job: CryptoJob, report: (p: number) => void): Promise<unknown> {
  switch (job.type) {
    case 'hash': {
      const { hashAll } = await import('./hashes');
      return hashAll(job, report);
    }
    case 'pw-hash': {
      const { hashPassword } = await import('./passwords');
      return hashPassword(job.algo, job.password, job.params);
    }
    case 'pw-verify': {
      const { verifyPassword } = await import('./passwords');
      return verifyPassword(job.password, job.hash);
    }
    case 'encrypt': {
      const E = await import('./encrypt');
      return job.format === 'openssl' ? E.openSslEncrypt(job.data, job.password, job.iterations) : E.encryptWithPassword(job.data, job.password, job.format, job.kdf);
    }
    case 'decrypt': {
      const E = await import('./encrypt');
      return E.isOpenSsl(job.data) ? E.openSslDecrypt(job.data, job.password, job.iterations) : E.decryptWithPassword(job.data, job.password);
    }
    case 'raw': {
      const { rawCipher } = await import('./encrypt');
      return rawCipher(job.algo, job.key, job.nonce, job.data, job.decrypt);
    }
  }
}

ctx.onmessage = async (e: MessageEvent<{ id: number; job: CryptoJob; lang: Lang }>) => {
  const { id, job, lang } = e.data;
  let last = 0;
  const report = (value: number) => {
    const now = performance.now();
    if (now - last < 80) return;
    last = now;
    ctx.postMessage({ id, type: 'progress', value });
  };
  try {
    await applyLang(lang).catch(() => {});
    const result = await run(job, report);
    ctx.postMessage({ id, type: 'done', result });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
