/**
 * The downloader's options turned into yt-dlp arguments, the checks on extra arguments people type,
 * and reading yt-dlp's output. Pure, so both the page and the local server (scripts/downloader-server.ts)
 * use it, and it can be tested on its own.
 */

export type Mode = 'video' | 'audio';
/** "best", or the most height wanted in pixels (e.g. "1080"). */
export type Quality = 'best' | `${number}`;
/** Subtitles go into the video, come as their own files next to it, or both. */
export type SubsMode = 'embed' | 'file' | 'both';
export type SubsFormat = 'srt' | 'vtt';
export type Container = 'mp4' | 'mkv' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'best';

export type DlOptions = {
  mode: Mode;
  quality: Quality;
  container: Container;
  audioFormat: AudioFormat;
  /** Audio: put the cover picture and title / artist / album into the file. */
  embedMeta: boolean;
  /** Video: subtitles put into the file; empty = none. e.g. "en,cs". */
  subs: string;
  /** Also the subtitles a site makes automatically (YouTube's auto captions). */
  autoSubs: boolean;
  subsMode: SubsMode;
  /** The files' format when they come as files. */
  subsFormat: SubsFormat;
  /** Cut out sponsored parts (SponsorBlock, YouTube only). */
  sponsorBlock: boolean;
  /** An exact format (yt-dlp format ids, e.g. "137+140"); empty = from the settings above. */
  format: string;
  /** More yt-dlp arguments, as typed. */
  extra: string;
};

export const DEFAULT_OPTIONS: DlOptions = {
  mode: 'video',
  quality: '1080',
  container: 'mp4',
  audioFormat: 'mp3',
  embedMeta: true,
  subs: '',
  autoSubs: false,
  subsMode: 'embed',
  subsFormat: 'srt',
  sponsorBlock: false,
  format: '',
  extra: '',
};

/** The format choice for the settings (without the extra arguments). */
export function optionArgs(o: DlOptions): string[] {
  const args: string[] = [];
  if (o.mode === 'audio') {
    args.push('-f', o.format || 'ba/b', '-x');
    if (o.audioFormat !== 'best') args.push('--audio-format', o.audioFormat);
    // Best VBR quality for MP3; ignored by the others.
    args.push('--audio-quality', '0');
    if (o.embedMeta) args.push('--embed-thumbnail', '--embed-metadata');
  } else {
    // (The options come from the page: anything odd falls back to the defaults.)
    const lim = /^\d{2,4}$/.test(o.quality) ? `[height<=${o.quality}]` : '';
    args.push('-f', o.format || `bv*${lim}+ba/b${lim}`);
    // MP4 should play everywhere: prefer H.264 video and AAC sound (YouTube has H.264 up to 1080p).
    if (o.container === 'mp4' && !o.format) args.push('-S', 'vcodec:h264,res,acodec:m4a');
    args.push('--merge-output-format', o.container);
    if (o.container === 'mp4') args.push('--remux-video', 'mp4');
    const langs = o.subs.split(/[\s,]+/).filter(Boolean);
    if (langs.length) {
      args.push('--write-subs', '--sub-langs', langs.join(','));
      if (o.autoSubs) args.push('--write-auto-subs');
      const mode = o.subsMode === 'file' || o.subsMode === 'both' ? o.subsMode : 'embed';
      if (mode !== 'embed') args.push('--convert-subs', o.subsFormat === 'vtt' ? 'vtt' : 'srt');
      if (mode !== 'file') args.push('--embed-subs');
      // With --write-subs yt-dlp keeps the files after putting them into the video; only wanted for "both".
      if (mode === 'embed') args.push('--compat-options', 'no-keep-subs');
    }
    args.push('--embed-metadata');
  }
  if (o.sponsorBlock) args.push('--sponsorblock-remove', 'sponsor');
  return args;
}

/** The picture heights a video has (from "info"), highest first. */
export function heightsOf(formats: { height?: number; vcodec?: string }[]): number[] {
  const set = new Set(formats.filter((f) => f.height && f.vcodec !== 'none').map((f) => f.height!));
  return [...set].sort((a, b) => b - a);
}

/**
 * The quality to really ask for on a video with these heights: the wanted height, or the highest
 * below it, or the lowest there is when all are higher (instead of a "format not available" error).
 */
export function fitQuality(q: Quality, heights: number[]): Quality {
  if (q === 'best' || !heights.length) return q;
  const want = Number(q);
  const below = heights.filter((h) => h <= want);
  return `${below.length ? below[0] : heights[heights.length - 1]}`;
}

/** Splits typed arguments like a command line: spaces separate, quotes group. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : (m[2] ?? m[3]));
  return out;
}

/**
 * Options that are refused in the extra arguments: they run other programs, write files outside
 * the download folder, read settings from elsewhere or replace the downloader / ffmpeg.
 */
const BLOCKED = new Set([
  '--exec', '--exec-before-download', '--no-exec', '--netrc-cmd', '--output', '--paths', '--config-location', '--config-locations',
  '--plugin-dirs', '--batch-file', '--load-info-json', '--cookies', '--download-archive', '--ffmpeg-location', '--downloader',
  '--external-downloader', '--downloader-args', '--external-downloader-args', '--print-to-file', '--update', '--update-to',
  '--use-postprocessor', '--postprocessor-args', '--ppa', '--alias', '--cache-dir', '--write-pages', '--ignore-config',
]);
const BLOCKED_SHORT = new Set(['o', 'P', 'a', 'U']);

/** The extra arguments, or an error naming the first one that isn't allowed. */
export function checkExtra(text: string): { args: string[] } | { error: string } {
  const args = splitArgs(text);
  for (const a of args) {
    if (a.startsWith('--')) {
      const name = a.split('=')[0].toLowerCase();
      if (BLOCKED.has(name)) return { error: `${name} isn't allowed here (it could run programs or write files elsewhere).` };
    } else if (/^-[a-zA-Z]+$/.test(a)) {
      const bad = [...a.slice(1)].find((c) => BLOCKED_SHORT.has(c));
      if (bad) return { error: `-${bad} isn't allowed here (the download folder and program are set by the site).` };
    }
  }
  return { args };
}

/** Only web addresses are downloaded (not file paths or other schemes). */
export function isWebUrl(text: string) {
  try {
    const u = new URL(text.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The line yt-dlp prints for progress (see PROGRESS_TEMPLATE), as numbers. */
export const PROGRESS_TEMPLATE = 'download:[unk] %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s';

export type Progress = { done: number; total: number; speed: number; eta: number };

export function parseProgress(line: string): Progress | null {
  const m = line.match(/^\[unk\] (.*)$/);
  if (!m) return null;
  const [done, total, estimate, speed, eta] = m[1].split('|').map((v) => Number(v));
  const size = Number.isFinite(total) && total > 0 ? total : Number.isFinite(estimate) ? estimate : 0;
  return { done: Number.isFinite(done) ? done : 0, total: size, speed: Number.isFinite(speed) ? speed : 0, eta: Number.isFinite(eta) ? eta : 0 };
}

export type Phase = 'starting' | 'downloading' | 'merging' | 'converting' | 'embedding' | 'finishing';

/** What yt-dlp is doing, from the tag at the start of its log lines. */
export function phaseOf(line: string): Phase | null {
  if (/^\[(download|unk)\]/.test(line)) return 'downloading';
  if (/^\[Merger\]/.test(line)) return 'merging';
  if (/^\[(ExtractAudio|VideoConvertor|VideoRemuxer|FFmpegVideoRemuxer)\]/.test(line)) return 'converting';
  if (/^\[(EmbedThumbnail|EmbedSubtitle|Metadata|FFmpegMetadata|ThumbnailsConvertor)\]/.test(line)) return 'embedding';
  if (/^\[(SponsorBlock|ModifyChapters)\]/.test(line)) return 'finishing';
  return null;
}

// ---- what the page gets from "info" ----

export type DlFormat = { id: string; ext: string; height?: number; fps?: number; vcodec?: string; acodec?: string; size?: number; tbr?: number; note?: string };
/** A subtitle language a video has: its code (what yt-dlp asks for) and its name. */
export type DlSub = { code: string; name: string };
export type DlEntry = { id: string; title: string; url: string; duration?: number };
export type DlInfo = {
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  url: string;
  site?: string;
  license?: string;
  playlist: boolean;
  entries: DlEntry[];
  formats: DlFormat[];
  /** Subtitles people made. */
  subtitles: DlSub[];
  /** Subtitles the site made automatically (YouTube: the spoken language first, then machine translations). */
  autoCaptions: DlSub[];
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The languages of yt-dlp's "subtitles" / "automatic_captions" (a map of code → list of files). */
function subsOf(v: unknown): DlSub[] {
  if (!v || typeof v !== 'object') return [];
  const list = Object.entries(v as Record<string, unknown>)
    .filter(([code]) => code !== 'live_chat')
    .map(([code, files]) => ({ code, name: (Array.isArray(files) ? str((files[0] as Raw | undefined)?.name) : undefined) ?? code }));
  // YouTube marks the spoken language "-orig": that one first.
  return [...list.filter((x) => x.code.endsWith('-orig')), ...list.filter((x) => !x.code.endsWith('-orig'))];
}

/** yt-dlp's (huge) JSON, cut down to what the page shows. */
export function trimInfo(j: Raw, asked: string): DlInfo {
  const playlist = j._type === 'playlist' || Array.isArray(j.entries);
  const entries = playlist
    ? ((j.entries as Raw[]) ?? []).filter(Boolean).map((e, i) => ({
        id: str(e.id) ?? String(i),
        title: str(e.title) ?? `Item ${i + 1}`,
        url: str(e.url) ?? str(e.webpage_url) ?? '',
        duration: num(e.duration),
      }))
    : [];
  const formats = ((j.formats as Raw[]) ?? [])
    .filter((f) => !/^(mhtml|sb\d)/.test(String(f.format_id)) && f.ext !== 'mhtml')
    .map((f) => ({
      id: String(f.format_id),
      ext: String(f.ext ?? ''),
      height: num(f.height),
      fps: num(f.fps),
      vcodec: str(f.vcodec),
      acodec: str(f.acodec),
      size: num(f.filesize) ?? num(f.filesize_approx),
      tbr: num(f.tbr),
      note: str(f.format_note),
    }));
  const thumbs = (j.thumbnails as Raw[] | undefined)?.filter((t) => str(t.url));
  return {
    title: str(j.title) ?? asked,
    uploader: str(j.uploader) ?? str(j.channel),
    duration: num(j.duration),
    thumbnail: str(j.thumbnail) ?? str(thumbs?.[thumbs.length - 1]?.url),
    url: str(j.webpage_url) ?? asked,
    site: str(j.extractor_key) ?? str(j.extractor),
    license: str(j.license),
    playlist,
    entries,
    formats,
    subtitles: subsOf(j.subtitles),
    autoCaptions: subsOf(j.automatic_captions),
  };
}

// ---- aria2c's progress (yt-dlp's own progress line doesn't cover external downloaders) ----

const UNIT: Record<string, number> = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
const bytes = (v: string) => {
  const m = v.match(/^([\d.]+)([KMGT]iB|B)$/);
  return m ? Number(m[1]) * UNIT[m[2]] : 0;
};
const seconds = (v: string) => {
  let s = 0;
  for (const [, n, u] of v.matchAll(/(\d+)([hms])/g)) s += Number(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : 1);
  return s;
};

/** aria2c's summary line: "[#e0a7b6 4.6MiB/17MiB(26%) CN:16 DL:2.5MiB ETA:4s]". */
export function parseAria2(line: string): (Progress & { connections: number }) | null {
  const m = line.match(/^\[#\w+ ([\d.]+[KMGT]?i?B)\/([\d.]+[KMGT]?i?B)\(\d+%\)(?: CN:(\d+))?(?: DL:([\d.]+[KMGT]?i?B))?(?: ETA:(\w+))?\]/);
  if (!m) return null;
  return { done: bytes(m[1]), total: bytes(m[2]), connections: Number(m[3] ?? 0), speed: m[4] ? bytes(m[4]) : 0, eta: m[5] ? seconds(m[5]) : 0 };
}

/** How many downloads make up the file ("Downloading 1 format(s): 134+140" = video + sound = 2). */
export function partsOf(line: string): number | null {
  const m = line.match(/Downloading \d+ format\(s\): (\S+)/);
  return m ? m[1].split('+').length : null;
}

/** yt-dlp starts the next download (the next part). */
export const isNewPart = (line: string) => /^\[download\] Destination: /.test(line);

/** The whole job's progress 0…1 from the current part: downloads are 95 %, the rest is joining and converting. */
export function overall(part: number, parts: number, done: number, total: number) {
  const n = Math.max(1, parts);
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  return Math.max(0, Math.min(0.95, ((Math.min(Math.max(1, part), n) - 1 + frac) / n) * 0.95));
}
