import type { OptionSchema, Opts } from '../../registry/types';
import type { Attempt } from '../../lib/ffmpeg';
import { trimArgs } from '../../lib/timecode';
import { fitShortSide } from './videoArgs';
import { t } from '../../lib/i18n-core';

/** "Make it bad": on purpose terrible quality, meme style. Shared by the video and the audio tool. */

export type Badness = 'bit' | 'bad' | 'awful' | 'unusable';
export type SoundFx = 'none' | 'bass' | 'earrape' | 'phone' | 'underwater' | 'crushed';
export type Picture = 'blurry' | 'pixelated' | 'fried';

type Level = {
  /** Sound: kbps, samples per second, channels. */
  kbps: number;
  rate: number;
  mono: boolean;
  /** Picture: the short side it's shrunk to, frames per second, video kbps. */
  side: number;
  /** "Pixelated": how many pixels wide each square is (SHOW_SIDE / pixel must be even). */
  pixel: number;
  fps: number;
  vkbps: number;
};

export const LEVELS: Record<Badness, Level> = {
  bit: { kbps: 48, rate: 22050, mono: false, side: 360, pixel: 6, fps: 24, vkbps: 300 },
  bad: { kbps: 24, rate: 16000, mono: false, side: 240, pixel: 8, fps: 15, vkbps: 120 },
  awful: { kbps: 16, rate: 11025, mono: true, side: 144, pixel: 12, fps: 12, vkbps: 50 },
  unusable: { kbps: 8, rate: 8000, mono: true, side: 96, pixel: 16, fps: 8, vkbps: 20 },
};

/**
 * Turning it up past full scale and clipping it hard is what makes "bass boosted" and "earrape"
 * sound broken; the result still never goes over full scale.
 */
const CLIP = 'asoftclip=type=hard';

export const SOUND_FX: Record<SoundFx, string[]> = {
  none: [],
  bass: ['bass=g=15:f=100:w=0.8', 'volume=-3dB', CLIP],
  earrape: ['bass=g=10:f=120', 'volume=28dB', CLIP, 'acrusher=bits=6:mode=log:aa=0'],
  phone: ['highpass=f=300', 'highpass=f=300', 'lowpass=f=3400', 'lowpass=f=3400', 'volume=7dB', CLIP],
  underwater: ['lowpass=f=350', 'lowpass=f=350', 'volume=6dB', CLIP],
  crushed: ['acrusher=bits=4:samples=6:mode=lin:aa=0'],
};

/**
 * The picked effects ("bass,phone"; an old single one like "bass" too), in the order they're
 * applied: first what shapes the sound (phone, underwater), then the boosting, the crushing last.
 */
const FX_ORDER: SoundFx[] = ['phone', 'underwater', 'bass', 'earrape', 'crushed'];
export const soundEffects = (value: unknown): SoundFx[] => {
  const picked = new Set(String(value ?? '').split(','));
  return FX_ORDER.filter((fx) => picked.has(fx));
};

/** The short side the picture is blown up to again, so it isn't tiny in the chat. */
export const SHOW_SIDE = 480;
const upTo = (side: number, flags: string) => `scale=if(gt(iw\\,ih)\\,-2\\,${side}):if(gt(iw\\,ih)\\,${side}\\,-2):flags=${flags}`;

/**
 * How each look is made: shrunk (`shrink` divides the level's size), blown up again, then `after`
 * runs on the big picture (sharpening the blocky edges is what makes "deep fried" look burnt).
 */
const PICTURE: Record<Exclude<Picture, 'pixelated'>, { shrink: number; up: string; after: string[] }> = {
  blurry: { shrink: 1.4, up: 'bicubic', after: ['boxblur=luma_radius=3:luma_power=1:chroma_radius=4:chroma_power=1'] },
  fried: { shrink: 1, up: 'bilinear', after: ['eq=saturation=3.5:contrast=2.2:brightness=0.08', 'unsharp=9:9:3:9:9:1.5', 'noise=alls=25:allf=t'] },
};

/** The picture filters between the frame rate and the final format. */
function pictureFilters(picture: Picture, l: Level) {
  if (picture === 'pixelated') {
    // Exact whole-number squares that line up with the encoder's 8×8 blocks, so even at a tiny
    // bitrate they stay sharp squares instead of smearing.
    return [`${fitShortSide(SHOW_SIDE / l.pixel)}:flags=area`, `scale=iw*${l.pixel}:ih*${l.pixel}:flags=neighbor`];
  }
  const pic = PICTURE[picture] ?? PICTURE.blurry;
  const small = Math.max(16, Math.round(l.side / pic.shrink / 2) * 2);
  return [`${fitShortSide(small)}:flags=area`, upTo(SHOW_SIDE, pic.up), ...pic.after];
}

/**
 * The sound filters and encoding settings for a level and effect (no codec). The sound always ends
 * up as plain 16-bit at one fixed rate and layout: whatever the video's sound does along the way
 * (switching to stereo halfway, odd channel setups, a filter overshooting into values the encoder
 * refuses), the encoder only ever gets ordinary samples.
 */
function soundArgs(o: Opts, minRate = 0) {
  const l = LEVELS[o.badness as Badness] ?? LEVELS.bad;
  const rate = Math.max(l.rate, minRate);
  const fx = soundEffects(o.soundFx).flatMap((k) => SOUND_FX[k]);
  const steady = [`aresample=${rate}`, `aformat=sample_fmts=s16:sample_rates=${rate}:channel_layouts=${l.mono ? 'mono' : 'stereo'}`];
  return ['-af', [...fx, ...steady].join(','), '-b:a', `${l.kbps}k`];
}

/** ffmpeg arguments for the audio tool: an MP3 (also from the sound of a video). Throws on badly typed times. */
export function badAudioCommand(o: Opts, input: string, output: string): string[] {
  const trim = trimArgs(String(o.start ?? ''), String(o.end ?? ''));
  return [...trim.before, '-i', input, ...trim.after, '-map', '0:a:0', '-vn', ...soundArgs(o), '-c:a', 'libmp3lame', output];
}

/**
 * ffmpeg arguments for the video tool: a small, ugly MP4 (AAC sound, or MP3 sound for the second
 * try). Throws on badly typed times.
 */
export function badVideoCommand(o: Opts, input: string, output: string, audioCodec: 'aac' | 'libmp3lame' = 'aac'): string[] {
  const trim = trimArgs(String(o.start ?? ''), String(o.end ?? ''));
  const l = LEVELS[o.badness as Badness] ?? LEVELS.bad;
  const vf = [`fps=${l.fps}`, ...pictureFilters(o.picture as Picture, l), 'setsar=1', 'format=yuv420p'].join(',');
  const video = ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${l.vkbps}k`, '-maxrate', `${l.vkbps}k`, '-bufsize', `${l.vkbps * 2}k`];
  const sound = o.audio === 'remove' ? ['-an'] : ['-map', '0:a:0?', ...soundArgs(o, audioCodec === 'aac' ? 0 : MP4_MP3_MIN_RATE), '-c:a', audioCodec];
  return [...trim.before, '-i', input, ...trim.after, '-map', '0:v:0', ...sound, '-vf', vf, ...video, '-movflags', '+faststart', output];
}

/** MP4 only takes MP3 sound at 16 kHz or more (not the 8 and 11 kHz of the worst levels). */
const MP4_MP3_MIN_RATE = 16000;

/**
 * The ways to make the video, best first. A failed run throws its ffmpeg away, so the second try is
 * the same thing in a fresh one (ffmpeg.wasm sometimes trips after several jobs); the last resort is
 * MP3 sound instead of AAC (MP4 holds that too, and browsers and Discord play it).
 */
export function badVideoAttempts(o: Opts): Attempt[] {
  const aac: Attempt = { args: (i, out) => badVideoCommand(o, i, out) };
  if (o.audio === 'remove') return [aac, aac];
  return [aac, aac, { args: (i, out) => badVideoCommand(o, i, out, 'libmp3lame') }];
}

/** "clip.mp4" → "clip-bad.mp4". */
export const badName = (name: string, ext: string) => `${name.replace(/\.[^./]+$/, '') || 'file'}-bad.${ext}`;

const TIME_HELP = t('Seconds (90) or minutes:seconds (1:30).');

/** The options of one of the two tools (the audio one has no picture settings). */
export const badOptions = (kind: 'video' | 'audio'): OptionSchema[] => {
  const options: OptionSchema[] = [
    {
      key: 'badness',
      label: t('How bad'),
      help:
        kind === 'video'
          ? t('How much quality is thrown away: a smaller picture, fewer frames, fewer colors and crunchier sound. “Unusable” is barely recognizable.')
          : t('How much quality is thrown away: fewer details and a duller, crunchier sound. “Unusable” sounds like an old phone in a tin can.'),
      type: 'choice',
      default: 'bad',
      choices: [
        { value: 'bit', label: t('a bit') },
        { value: 'bad', label: t('bad') },
        { value: 'awful', label: t('awful') },
        { value: 'unusable', label: t('unusable') },
      ],
    },
    {
      key: 'soundFx',
      label: t('Sound effects'),
      help: t('Pick any number, they all go on together (none picked = none). Bass boosted: huge, distorted bass. Earrape: as loud and distorted as it gets, careful with headphones. Phone call: thin, like through a phone. Underwater: only the low, muffled part. Crushed: robotic, like an old video game.'),
      type: 'multi',
      default: '',
      when: (o) => o.audio !== 'remove',
      choices: [
        { value: 'bass', label: t('bass boosted') },
        { value: 'earrape', label: t('earrape') },
        { value: 'phone', label: t('phone call') },
        { value: 'underwater', label: t('underwater') },
        { value: 'crushed', label: t('crushed') },
      ],
    },
  ];
  if (kind === 'video') {
    options.push(
      {
        key: 'picture',
        label: t('Picture'),
        help: t('Blurry: shrunk and blown up again, smudgy. Pixelated: big blocky squares. Deep fried: crazy colors, way too sharp and noisy. It comes out {SHOW_SIDE}p so it isn\'t tiny in a chat.', { SHOW_SIDE }),
        type: 'choice',
        default: 'blurry',
        choices: [
          { value: 'blurry', label: t('blurry') },
          { value: 'pixelated', label: t('pixelated') },
          { value: 'fried', label: t('deep fried') },
        ],
      },
      {
        key: 'audio',
        label: t('Sound'),
        help: t('Remove takes the sound out completely.'),
        type: 'choice',
        default: 'keep',
        choices: [
          { value: 'keep', label: t('keep') },
          { value: 'remove', label: t('remove') },
        ],
      },
    );
  }
  options.push(
    { key: 'start', label: t('Start at'), help: t('Cut off the beginning. {TIME_HELP} Empty starts at the beginning.', { TIME_HELP }), type: 'text', default: '', placeholder: t('e.g. 0:05'), mono: true },
    { key: 'end', label: t('End at'), help: t('Cut off the end: the time in the original where it should stop. {TIME_HELP} Empty goes to the end.', { TIME_HELP }), type: 'text', default: '', placeholder: t('e.g. 1:30'), mono: true },
  );
  return options;
};
