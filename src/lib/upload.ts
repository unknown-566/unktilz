/**
 * Puts a file on the internet and gives back a link to it, for sharing a GIF on Discord & co.
 * - "forever": catbox.moe;
 * - 1 hour to 3 days: litterbox.catbox.moe, which deletes the file by itself.
 * Both are free and need no account; anyone with the link can see the file. Their APIs don't let web
 * pages upload with progress (no CORS preflight), so requests go through the site's own server (the
 * /upload/* proxies in vite.config.ts).
 */

export type Lasts = 'forever' | '72h' | '24h' | '12h' | '1h';

export const LASTS: { value: Lasts; label: string }[] = [
  { value: 'forever', label: 'forever' },
  { value: '72h', label: '3 days' },
  { value: '24h', label: '1 day' },
  { value: '12h', label: '12 hours' },
  { value: '1h', label: '1 hour' },
];

const HOURS: Record<Lasts, number> = { forever: Infinity, '72h': 72, '24h': 24, '12h': 12, '1h': 1 };

/** When a link made at `at` stops working (Infinity for forever). */
export const expiresAt = (lasts: Lasts, at: number) => at + HOURS[lasts] * 3600_000;

/** The biggest file each one takes. */
export const MAX_UPLOAD: Record<'catbox' | 'litterbox', number> = { catbox: 200 * 1024 * 1024, litterbox: 1024 * 1024 * 1024 };

export const hostOf = (lasts: Lasts) => (lasts === 'forever' ? 'catbox' : 'litterbox');

const ENDPOINT = {
  catbox: '/upload/catbox',
  litterbox: '/upload/litterbox',
};

/** The link in an answer from catbox / litterbox (they answer with just the link), or why there's none. */
export function parseUploadReply(status: number, body: string, host: 'catbox' | 'litterbox'): string {
  const text = body.trim();
  if (status >= 200 && status < 300 && /^https:\/\/\S+$/.test(text)) return text;
  // No proxy: a 404, or (on some hosts) the site's own page instead of an answer.
  if (status === 404 || (status < 300 && text.startsWith('<'))) {
    throw new Error('Links need the site started with start.bat (or npm run dev / npm run preview).');
  }
  if (status === 413) throw new Error('The GIF is too big to upload.');
  // Their firewall turns away an address for a while after too many failed requests.
  if (status === 403) throw new Error(`${host === 'catbox' ? 'catbox.moe' : 'litterbox'} refused the upload right now. Try again later${host === 'litterbox' ? ', or pick “forever”' : ''}.`);
  const why = text && !text.startsWith('<') ? text.slice(0, 160) : `HTTP ${status}`;
  throw new Error(`${host === 'catbox' ? 'catbox.moe' : 'litterbox'} didn’t take it: ${why}`);
}

/** Uploads a file; resolves with its link. `onProgress` gets 0–1. */
export function uploadFile(blob: Blob, name: string, lasts: Lasts, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<string> {
  const host = hostOf(lasts);
  return new Promise((resolve, reject) => {
    if (blob.size > MAX_UPLOAD[host]) {
      reject(new Error(`The GIF is too big to upload (${host === 'catbox' ? 'max 200 MB' : 'max 1 GB'}).`));
      return;
    }
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    if (host === 'litterbox') form.append('time', lasts);
    form.append('fileToUpload', blob, name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT[host]);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(parseUploadReply(xhr.status, xhr.responseText, host));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error('Couldn’t reach the upload site. Check the internet connection.'));
    xhr.ontimeout = () => reject(new Error('The upload took too long. Try again.'));
    xhr.onabort = () => reject(new DOMException('Upload stopped', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
