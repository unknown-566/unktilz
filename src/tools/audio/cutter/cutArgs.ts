import { ffTime } from '../../../lib/timecode';
import { CODEC, LOSSLESS, type AudioFormat } from '../audioArgs';
import { t } from '../../../lib/i18n-core';

export type CutMode = 'keep' | 'remove';

export type Cut = {
  /** The picked part, in seconds of the original. */
  start: number;
  end: number;
  /** The whole file's length. */
  duration: number;
  /** Keep only the part, or cut it out and join what's around it. */
  mode: CutMode;
  /** Seconds of fade at the start and end of the result. */
  fadeIn: number;
  fadeOut: number;
  format: AudioFormat;
  /** kbps, for the lossy formats. */
  bitrate: string;
};

/** A part this close to an edge reaches it (so cutting out "from 0" just takes the beginning off). */
const EDGE = 0.005;
/** A few milliseconds of fade on both sides of a join, so it doesn't click. */
const JOIN = 0.004;

/** Sound files, and videos (their sound is taken). */
export const CUTTER_ACCEPTS = [
  '.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wma', '.aif', '.aiff', '.amr', '.weba', '.mka',
  '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp',
];

export const AUDIO_EXTS: Record<string, AudioFormat> = { mp3: 'mp3', wav: 'wav', ogg: 'ogg', oga: 'ogg', opus: 'opus', weba: 'opus', flac: 'flac', m4a: 'm4a', aac: 'm4a' };

/** The output format that matches the file (videos and rare formats come out as MP3). */
export const formatFor = (name: string): AudioFormat => AUDIO_EXTS[name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? ''] ?? 'mp3';

export const cutName = (name: string, format: AudioFormat) => `${name.replace(/\.[^./]+$/, '') || 'audio'}-cut.${format}`;

/** How long the result is. */
export const resultLength = (c: Pick<Cut, 'start' | 'end' | 'duration' | 'mode'>) => (c.mode === 'keep' ? c.end - c.start : c.duration - (c.end - c.start));

/** The ffmpeg arguments for one cut. Throws when there's nothing to cut or nothing would be left. */
export function cutCommand(c: Cut, input: string, output: string): string[] {
  if (c.end - c.start < 0.01) throw new Error(t('Pick a part first: drag across the wave.'));
  const length = resultLength(c);
  if (length < 0.01) throw new Error(t('That would leave nothing. Pick a smaller part to cut out.'));

  const fades: string[] = [];
  const fadeIn = Math.min(Math.max(0, c.fadeIn), length);
  const fadeOut = Math.min(Math.max(0, c.fadeOut), length);
  if (fadeIn > 0) fades.push(`afade=t=in:st=0:d=${ffTime(fadeIn)}`);
  if (fadeOut > 0) fades.push(`afade=t=out:st=${ffTime(Math.max(0, length - fadeOut))}:d=${ffTime(fadeOut)}`);
  const encode = [...CODEC[c.format], ...(LOSSLESS.has(c.format) ? [] : ['-b:a', `${c.bitrate}k`]), output];

  const head = c.start > EDGE;
  const tail = c.end < c.duration - EDGE;
  if (c.mode === 'keep' || !head || !tail) {
    // One piece of the original: the part itself, or what's before or after it.
    const [a, b] = c.mode === 'keep' ? [c.start, c.end] : head ? [0, c.start] : [c.end, c.duration];
    return [...(a > 0 ? ['-ss', ffTime(a)] : []), '-i', input, '-t', ffTime(b - a), '-map', '0:a:0', '-vn', ...(fades.length ? ['-af', fades.join(',')] : []), ...encode];
  }

  // Two pieces joined: before the part and after it.
  const j = Math.min(JOIN, c.start / 2, (c.duration - c.end) / 2);
  const graph = [
    '[0:a:0]asplit=2[p][q]',
    `[p]atrim=end=${ffTime(c.start)},asetpts=PTS-STARTPTS,afade=t=out:st=${ffTime(c.start - j)}:d=${ffTime(j)}[x]`,
    `[q]atrim=start=${ffTime(c.end)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${ffTime(j)}[y]`,
    `[x][y]concat=n=2:v=0:a=1${fades.length ? `,${fades.join(',')}` : ''}[out]`,
  ].join(';');
  return ['-i', input, '-filter_complex', graph, '-map', '[out]', ...encode];
}

/** 83.456 → "1:23.46" (and "1:02:03.00" past an hour), the way the time fields show it. */
export function fmtTime(seconds: number, digits = 2) {
  const k = 10 ** digits;
  const s = Math.round(Math.max(0, seconds) * k) / k;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
