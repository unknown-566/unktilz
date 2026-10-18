/**
 * Puts a file on the internet and gives back a link to it, for sharing a GIF on Discord & co.
 * - catbox.moe ("forever") and litterbox.catbox.moe (1 hour to 3 days, deletes the file by itself):
 *   free, no account. Discord may not show their links as pictures.
 * - imgur: needs a free Client ID of your own; Discord shows imgur links as GIFs, and an upload can be
 *   deleted again with the delete code imgur gives back.
 * Anyone with a link can see the file. Requests go through the site's own server (the /upload/*
 * proxies in vite.config.ts): catbox and litterbox don't let web pages upload with progress (no CORS
 * preflight) and imgur turns away localhost pages.
 */

export type Lasts = 'forever' | '72h' | '24h' | '12h' | '1h';
export type Host = 'catbox' | 'imgur';

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

type Service = 'catbox' | 'litterbox' | 'imgur';

/** The biggest file each one takes. */
export const MAX_UPLOAD: Record<Service, number> = { catbox: 200 * 1024 * 1024, litterbox: 1024 * 1024 * 1024, imgur: 200 * 1024 * 1024 };

/** Where a link goes: catbox for some time, or imgur with your Client ID. */
export type Dest = { host: 'catbox'; lasts: Lasts } | { host: 'imgur'; clientId: string };
export type Uploaded = { url: string; deleteHash?: string };

const serviceOf = (d: Dest): Service => (d.host === 'imgur' ? 'imgur' : d.lasts === 'forever' ? 'catbox' : 'litterbox');
const NAMES: Record<Service, string> = { catbox: 'catbox.moe', litterbox: 'litterbox', imgur: 'imgur' };

const ENDPOINT: Record<Service, string> = {
  catbox: '/upload/catbox',
  litterbox: '/upload/litterbox',
  imgur: '/upload/imgur',
};

const NO_PROXY = 'Links need the site started with start.bat (or npm run dev / npm run preview).';

/** The link in an answer from catbox / litterbox (they answer with just the link), or why there's none. */
export function parseUploadReply(status: number, body: string, host: 'catbox' | 'litterbox'): string {
  const text = body.trim();
  if (status >= 200 && status < 300 && /^https:\/\/\S+$/.test(text)) return text;
  // No proxy: a 404, or (on some hosts) the site's own page instead of an answer.
  if (status === 404 || (status < 300 && text.startsWith('<'))) throw new Error(NO_PROXY);
  if (status === 413) throw new Error('The GIF is too big to upload.');
  // Their firewall turns away an address for a while after too many failed requests.
  if (status === 403) throw new Error(`${NAMES[host]} refused the upload right now. Try again later${host === 'litterbox' ? ', or pick “forever”' : ''}.`);
  const why = text && !text.startsWith('<') ? text.slice(0, 160) : `HTTP ${status}`;
  throw new Error(`${NAMES[host]} didn’t take it: ${why}`);
}

/** The link and delete code in imgur's JSON answer, or why there's none. */
export function parseImgurReply(status: number, body: string): Uploaded {
  let json: { success?: boolean; data?: { link?: string; deletehash?: string; error?: string | { message?: string } } } | null = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* not JSON */
  }
  const link = json?.data?.link;
  if (status >= 200 && status < 300 && json?.success && link) return { url: link.replace(/^http:/, 'https:'), deleteHash: json.data?.deletehash };
  if (!json && (status === 404 || body.trim().startsWith('<'))) throw new Error(NO_PROXY);
  if (status === 401 || status === 403) throw new Error('imgur didn’t accept the Client ID. Check that it’s the Client ID (not the secret) of an app made for anonymous use.');
  // imgur answers uploads with a wrong Client ID this way too, not just real rate limits.
  if (status === 429) throw new Error('imgur turned the upload away (“too many requests”). It does that with a wrong Client ID too: check it, or try again later.');
  if (status === 413) throw new Error('The GIF is too big for imgur.');
  const err = json?.data?.error;
  const why = (typeof err === 'string' ? err : err?.message) || `HTTP ${status}`;
  throw new Error(`imgur didn’t take it: ${why}`);
}

/** Uploads a file; resolves with its link. `onProgress` gets 0–1. */
export function uploadFile(blob: Blob, name: string, dest: Dest, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const service = serviceOf(dest);
  return new Promise((resolve, reject) => {
    if (blob.size > MAX_UPLOAD[service]) {
      reject(new Error(`The GIF is too big to upload (max ${Math.round(MAX_UPLOAD[service] / 1024 / 1024)} MB).`));
      return;
    }
    if (dest.host === 'imgur' && !dest.clientId.trim()) {
      reject(new Error('Put your imgur Client ID in first.'));
      return;
    }
    const form = new FormData();
    if (dest.host === 'imgur') {
      form.append('image', blob, name);
      form.append('type', 'file');
      form.append('title', name.replace(/\.[^.]+$/, ''));
    } else {
      form.append('reqtype', 'fileupload');
      if (service === 'litterbox') form.append('time', dest.lasts);
      form.append('fileToUpload', blob, name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT[service]);
    if (dest.host === 'imgur') xhr.setRequestHeader('Authorization', `Client-ID ${dest.clientId.trim()}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(service === 'imgur' ? parseImgurReply(xhr.status, xhr.responseText) : { url: parseUploadReply(xhr.status, xhr.responseText, service) });
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

/** Deletes an imgur upload with the delete code it came with. */
export async function deleteImgur(deleteHash: string, clientId: string) {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT.imgur}/${encodeURIComponent(deleteHash)}`, { method: 'DELETE', headers: { Authorization: `Client-ID ${clientId.trim()}` } });
  } catch {
    throw new Error('Couldn’t reach imgur. Check the internet connection.');
  }
  // Already gone counts as deleted.
  if (!res.ok && res.status !== 404) throw new Error(`imgur didn’t delete it (HTTP ${res.status}).`);
}
