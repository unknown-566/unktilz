import { ffmpegRun } from '../ffmpeg';
import { t } from '../i18n-core';

/** A sound's wave, small enough to keep: the lowest and highest sample in each short slice. */
export type Peaks = {
  duration: number;
  /** Slices per second. */
  rate: number;
  min: Float32Array;
  max: Float32Array;
  /** The loudest sample (0…1), so quiet files can be drawn as tall as loud ones. */
  top: number;
};

/** The wave only needs this much: decoding at a low rate keeps a long song at a few hundred MB at most. */
const DECODE_RATE = 8000;
const MAX_SLICES = 2_000_000;

export function peaksOf(buf: AudioBuffer): Peaks {
  const rate = Math.min(1000, Math.max(1, Math.floor(MAX_SLICES / Math.max(buf.duration, 0.001))));
  const per = buf.sampleRate / rate;
  const n = Math.max(1, Math.ceil(buf.length / per));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * per);
      const b = Math.min(d.length, Math.floor((i + 1) * per));
      let lo = min[i];
      let hi = max[i];
      for (let k = a; k < b; k++) {
        const v = d[k];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[i] = lo;
      max[i] = hi;
    }
  }
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, -min[i], max[i]);
  return { duration: buf.duration, rate, min, max, top: Math.min(1, top) };
}

const decode = (data: ArrayBuffer) => new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(data);

/** Just the wave, when the browser can read the file itself (null when it can't). */
export async function wavePeaks(file: Blob): Promise<Peaks | null> {
  try {
    const p = peaksOf(await decode(await file.arrayBuffer()));
    return p.duration > 0 ? p : null;
  } catch {
    return null;
  }
}

/** Whether this browser can play the file in an <audio> (decoding can work when playing doesn't, and the other way round). */
function canPlay(blob: Blob) {
  return new Promise<boolean>((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      a.removeAttribute('src');
      a.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 8000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(true);
    a.onerror = () => done(false);
    a.src = url;
  });
}

export type OpenedAudio = {
  peaks: Peaks;
  /** What to play: the file itself, or a copy ffmpeg made when the browser can't play it. */
  play: Blob;
  converted: boolean;
};

/**
 * Reads a sound (or a video's sound) for showing and playing. The browser does it when it can;
 * otherwise ffmpeg makes an Ogg copy (its first use downloads it, about 30 MB).
 */
export async function openAudio(file: File, onConvert?: (p: number) => void, signal?: AbortSignal): Promise<OpenedAudio> {
  const playable = await canPlay(file);
  let peaks: Peaks | null = null;
  try {
    peaks = peaksOf(await decode(await file.arrayBuffer()));
  } catch {
    // ffmpeg below.
  }
  if (peaks && peaks.duration > 0 && playable) return { peaks, play: file, converted: false };

  onConvert?.(0);
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const input = `in.${ext}`;
  let ogg: Uint8Array;
  try {
    [ogg] = await ffmpegRun([{ name: input, data: new Uint8Array(await file.arrayBuffer()) }], ['-i', input, '-map', '0:a:0', '-vn', '-c:a', 'libvorbis', '-q:a', '4', 'play.ogg'], ['play.ogg'], { signal, onProgress: onConvert });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(t('This file can’t be opened, or it has no sound.'));
  }
  const play = new Blob([ogg as BlobPart], { type: 'audio/ogg' });
  if (!peaks || !(peaks.duration > 0)) peaks = peaksOf(await decode(await play.arrayBuffer()));
  return { peaks, play, converted: true };
}
