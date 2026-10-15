import type { Opts } from '../../registry/types';
import { streamCodecs, type Attempt } from '../../lib/ffmpeg';
import { trimArgs } from '../../lib/timecode';

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'gif';
export type VideoQuality = 'keep' | 'high' | 'balanced' | 'small';

export const VIDEO_MIME: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  gif: 'image/gif',
};

/** Lower is better quality and a bigger file. "keep" is used when a straight copy isn't possible. */
const X264_CRF: Record<VideoQuality, number> = { keep: 20, high: 22, balanced: 26, small: 30 };
/**
 * WebM uses VP8: VP9 crashes in this ffmpeg.wasm build ("memory access out of bounds").
 * VP8 needs a bitrate ceiling next to its crf.
 */
const VP8: Record<VideoQuality, [crf: number, maxRate: string]> = { keep: [8, '12M'], high: [12, '6M'], balanced: [20, '2500k'], small: [30, '1M'] };

/**
 * Fits the short side into `size` (so 720p works for portrait phone videos too), never upscales,
 * and keeps both sides even, which H.264 and VP9 need.
 */
export const fitShortSide = (size: number) =>
  `scale=if(gt(iw\\,ih)\\,-2\\,trunc(min(iw\\,${size})/2)*2):if(gt(iw\\,ih)\\,trunc(min(ih\\,${size})/2)*2\\,-2)`;
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

/** Containers a copied stream can go into without re-encoding, by format. */
const COPY_OK: Partial<Record<VideoFormat, { video: string[]; audio: string[] }>> = {
  mp4: { video: ['h264', 'mpeg4'], audio: ['aac', 'mp3', 'alac', 'ac3'] },
  mov: { video: ['h264', 'mpeg4'], audio: ['aac', 'mp3', 'alac', 'ac3', 'pcm_s16le'] },
};

/** Whether the input's codecs fit the target as they are (mkv takes anything). */
function copyFits(format: VideoFormat, log: string[], want: 'h264' | 'hevc', keepAudio: boolean) {
  const { video, audio } = streamCodecs(log);
  if (!video.length) return false;
  if (format === 'mkv') return want === 'h264';
  const ok = COPY_OK[format];
  if (!ok) return false;
  const v = video[0];
  if (want === 'hevc' ? v !== 'hevc' : !ok.video.includes(v)) return false;
  return !keepAudio || !audio.length || ok.audio.includes(audio[0]);
}

/** The ways to make the output, best first. Throws when the options are typed wrong. */
export function videoAttempts(o: Opts): Attempt[] {
  const format = o.format as VideoFormat;
  const trim = trimArgs(String(o.start ?? ''), String(o.end ?? ''));
  const keepAudio = o.audio !== 'remove';

  if (format === 'gif') {
    const scale = o.gifWidth === 'keep' ? '' : `,scale=${o.gifWidth}:-2:flags=lanczos`;
    const vf = `fps=${o.gifFps}${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
    return [{ args: (i, out) => [...trim.before, '-i', i, ...trim.after, '-vf', vf, '-loop', '0', out] }];
  }

  const quality = (o.quality as VideoQuality) || 'balanced';
  const faststart = format === 'mp4' || format === 'mov' ? ['-movflags', '+faststart'] : [];
  const audioMap = keepAudio ? ['-map', '0:a:0?'] : ['-an'];
  const attempts: Attempt[] = [];

  // Only the container changes: copy the streams as they are (instant, no quality loss).
  const unchanged = quality === 'keep' && o.resolution === 'keep' && o.fps === 'keep' && !trim.trimmed && format !== 'webm';
  if (unchanged) {
    const copy = (extra: string[]) => (i: string, out: string) => ['-i', i, '-map', '0:v:0', ...audioMap, '-c', 'copy', ...extra, ...faststart, out];
    attempts.push({ args: copy([]), accept: (log) => copyFits(format, log, 'h264', keepAudio) });
    // iPhone videos are HEVC; Apple players need the hvc1 tag to play it from an .mp4 / .mov.
    if (format !== 'mkv') attempts.push({ args: copy(['-tag:v', 'hvc1']), accept: (log) => copyFits(format, log, 'hevc', keepAudio) });
  }

  const filters = [o.fps !== 'keep' ? `fps=${o.fps}` : '', o.resolution !== 'keep' ? fitShortSide(Number(o.resolution)) : EVEN].filter(Boolean);
  const webm = format === 'webm';
  const video = webm
    ? ['-c:v', 'libvpx', '-deadline', 'good', '-cpu-used', '4', '-crf', String(VP8[quality][0]), '-b:v', VP8[quality][1], '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(X264_CRF[quality]), '-pix_fmt', 'yuv420p'];
  const audio = !keepAudio ? [] : webm ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '160k'];
  attempts.push({
    args: (i, out) => [...trim.before, '-i', i, ...trim.after, '-map', '0:v:0', ...audioMap, '-vf', filters.join(','), ...video, ...audio, ...faststart, out],
  });
  return attempts;
}

/** "clip.mov" → "clip.mp4"; the same extension gets "-converted" so it doesn't look unchanged. */
export function outputName(name: string, ext: string) {
  const base = name.replace(/\.[^./]+$/, '') || 'file';
  const same = name.toLowerCase().endsWith(`.${ext}`);
  return `${base}${same ? '-converted' : ''}.${ext}`;
}
