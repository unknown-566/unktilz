import type { Opts } from '../../registry/types';
import { ffTime, parseTime, trimArgs } from '../../lib/timecode';
import { audioArgs } from './audioOptions';

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'opus' | 'flac' | 'm4a';

export const AUDIO_MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
};

/** Formats that store the sound exactly, so a bitrate means nothing. */
export const LOSSLESS = new Set<AudioFormat>(['wav', 'flac']);

export const OPUS = ['-c:a', 'opus', '-strict', '-2', '-ar', '48000'];

const CODEC: Record<AudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame'],
  wav: ['-c:a', 'pcm_s16le'],
  ogg: ['-c:a', 'libvorbis'],
  // libopus crashes on stereo in this ffmpeg.wasm build ("memory access out of bounds"); ffmpeg's own
  // Opus encoder works and only needs 48 kHz.
  opus: OPUS,
  flac: ['-c:a', 'flac'],
  m4a: ['-c:a', 'aac', '-movflags', '+faststart'],
};

const VOLUME: Record<string, string> = {
  normalize: 'loudnorm=I=-16:TP=-1.5:LRA=11',
  louder: 'volume=6dB',
  quieter: 'volume=-6dB',
};

/** The ffmpeg arguments for one audio conversion. Throws when the options are typed wrong. */
export function audioCommand(o: Opts, input: string, output: string): string[] {
  const format = o.format as AudioFormat;
  const start = String(o.start ?? '');
  const end = String(o.end ?? '');
  const trim = trimArgs(start, end);
  const filters: string[] = [];
  if (VOLUME[String(o.volume)]) filters.push(VOLUME[String(o.volume)]);
  // loudnorm hands on doubles, and in this ffmpeg.wasm build the encoders then fail ("Error while
  // processing the decoded data") unless the format is set right after it and again at the end
  // (Opus wants fltp, the rest s16).
  const normalize = o.volume === 'normalize';
  if (normalize) filters.push('aformat=sample_fmts=fltp');

  const fadeIn = Math.max(0, Number(o.fadeIn) || 0);
  const fadeOut = Math.max(0, Number(o.fadeOut) || 0);
  if (fadeIn) filters.push(`afade=t=in:st=0:d=${ffTime(fadeIn)}`);
  if (fadeOut) {
    const b = parseTime(end, 'End');
    if (b !== null) {
      // The length is known from the trim, so the fade can start at a fixed time.
      const length = b - (parseTime(start, 'Start') ?? 0);
      filters.push(`afade=t=out:st=${ffTime(Math.max(0, length - fadeOut))}:d=${ffTime(fadeOut)}`);
    } else {
      // Unknown length: fade in the reversed sound, then turn it back around.
      filters.push(`areverse,afade=t=in:st=0:d=${ffTime(fadeOut)},areverse`);
    }
  }

  if (normalize && format !== 'opus') filters.push('aformat=sample_fmts=s16');

  // Opus only takes 48 kHz (ffmpeg resamples by itself); lossless formats have no bitrate.
  const quality = audioArgs({ ...o, sampleRate: format === 'opus' ? 'keep' : o.sampleRate }).filter((_, i, a) => !(LOSSLESS.has(format) && (a[i] === '-b:a' || a[i - 1] === '-b:a')));
  // loudnorm works at 192 kHz and hands that on, which MP3, OGG and most players don't take. (An
  // aresample filter instead of -ar makes WAV and FLAC fail in this ffmpeg.wasm build.)
  const rate = normalize && o.sampleRate === 'keep' && format !== 'opus' ? ['-ar', '48000'] : [];
  return [...trim.before, '-i', input, ...trim.after, '-map', '0:a:0', '-vn', ...(filters.length ? ['-af', filters.join(',')] : []), ...CODEC[format], ...quality, ...rate, output];
}
