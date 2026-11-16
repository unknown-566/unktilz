// i18n-ignore-file: mime types and ffmpeg arguments
import { ffmpegRun } from '../../../lib/ffmpeg';

export type What = 'screen' | 'mic';
export type Quality = '720' | '1080' | 'source';
export type VideoFormat = 'mp4' | 'webm';
export type AudioFormat = 'mp3' | 'original';

export const canRecordScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';
export const canRecordMic = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

const supported = (types: string[]) => types.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

/** Can this browser write MP4 by itself (Chrome and Edge can, Firefox can't)? */
export const nativeMp4 = () => typeof MediaRecorder !== 'undefined' && !!supported(['video/mp4;codecs=avc1.64001F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4']);

/** The best format the browser records in, for what is wanted. */
export function pickMime(what: What, format: VideoFormat) {
  if (what === 'mic') return supported(['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']);
  const mp4 = ['video/mp4;codecs=avc1.64001F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return supported(format === 'mp4' ? [...mp4, ...webm] : [...webm, ...mp4]);
}

const HEIGHT: Record<Quality, number | undefined> = { '720': 720, '1080': 1080, source: undefined };

/** Bits per second for the video: enough for sharp text, not huge files. */
export function videoBitrate(quality: Quality, fps: number) {
  const base = quality === '720' ? 4_000_000 : quality === '1080' ? 8_000_000 : 12_000_000;
  return fps > 30 ? base * 1.5 : base;
}

export function displayConstraints(quality: Quality, fps: number, sound: boolean): DisplayMediaStreamOptions {
  const h = HEIGHT[quality];
  return {
    video: { frameRate: { ideal: fps, max: fps }, ...(h ? { height: { ideal: h, max: h } } : {}) },
    audio: sound ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    // Chrome: offer the window and screen first, don't record this tab by default, let the user switch.
    ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: sound ? 'include' : 'exclude' } as object),
  } as DisplayMediaStreamOptions;
}

export const micConstraints: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

/** The file extension for a recorded mime type. */
export const extOf = (mime: string) => (mime.includes('mp4') ? (mime.startsWith('audio') ? 'm4a' : 'mp4') : mime.includes('ogg') ? 'ogg' : 'webm');

/** "screen-recording-2026-11-16-14-05" */
export function baseName(what: What, at: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}-${p(at.getMinutes())}`;
  return `${what === 'mic' ? 'microphone-recording' : 'screen-recording'}-${stamp}`;
}

/** Bigger files are saved as recorded: ffmpeg in the browser can't hold them twice. */
const TIDY_LIMIT = 700 * 1024 * 1024;

/**
 * Makes the recording into the wanted file. The browser's own files have no length written in them
 * (players can't jump around in a WebM), so they are copied once into a proper file (fast: nothing
 * is encoded again). Only WebM → MP4 (Firefox) and the MP3 for the microphone are really converted.
 */
export async function finish(
  blob: Blob,
  mime: string,
  what: What,
  want: VideoFormat | AudioFormat,
  name: string,
  signal: AbortSignal,
  onProgress: (p: number) => void,
): Promise<{ name: string; blob: Blob }> {
  const ext = extOf(mime);
  const raw = { name: `${name}.${ext}`, blob };
  const input = async () => [{ name: `in.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) }];
  const run = async (args: string[], out: string, type: string) => {
    const [data] = await ffmpegRun(await input(), ['-i', `in.${ext}`, ...args, out], [out], { signal, onProgress });
    return { name: `${name}.${out.split('.').pop()}`, blob: new Blob([data as BlobPart], { type }) };
  };

  /** If tidying fails the recording is still good as it is (but stopping is stopping). */
  const orRaw = (e: unknown) => {
    if (signal.aborted) throw e;
    return raw;
  };

  if (what === 'mic') {
    if (want === 'mp3') return run(['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'], 'out.mp3', 'audio/mpeg');
    if (blob.size > TIDY_LIMIT) return raw;
    return run(['-c', 'copy'], `out.${ext}`, mime.split(';')[0]).catch(orRaw);
  }
  if (want === 'mp4' && ext !== 'mp4')
    return run(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'], 'out.mp4', 'video/mp4');
  if (blob.size > TIDY_LIMIT) return raw;
  const tidy = ext === 'mp4' ? ['-c', 'copy', '-movflags', '+faststart'] : ['-c', 'copy'];
  return run(tidy, `out.${ext}`, mime.split(';')[0]).catch(orRaw);
}
