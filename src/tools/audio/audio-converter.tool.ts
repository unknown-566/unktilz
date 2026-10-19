import { defineTool, type Opts } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { outputName } from '../video/videoArgs';
import { audioOptions } from './audioOptions';
import { AUDIO_MIME, LOSSLESS, audioCommand, type AudioFormat } from './audioArgs';

const lossy = (o: Opts) => !LOSSLESS.has(o.format as AudioFormat);
const [bitrate, sampleRate, channels] = audioOptions;

export default defineTool({
  slug: 'audio-converter',
  name: 'Audio converter',
  category: 'audio',
  order: 1,
  meta: 'mp3 · wav · ogg · flac',
  description: 'Convert sound to MP3, WAV, OGG, Opus, FLAC or M4A, or take the sound out of a video. Can also cut it shorter, fade it in and out and fix the volume.',
  keywords: [
    'ogg to mp3', 'mp3 to ogg', 'wav to mp3', 'mp3 to wav', 'flac to mp3', 'm4a to mp3', 'mp4 to mp3', 'video to mp3', 'extract audio', 'opus', 'vorbis',
    'trim audio', 'cut audio', 'normalize', 'volume', 'fade', 'minecraft sounds', 'convert',
  ],
  accepts: [
    '.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wma', '.aif', '.aiff', '.amr', '.weba', '.mka',
    '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp',
  ],
  options: [
    {
      key: 'format',
      label: 'Format',
      help: 'MP3 plays everywhere. OGG is what Minecraft sounds use. Opus is the smallest for the same quality. M4A is for Apple devices. WAV and FLAC keep the sound exactly (FLAC is about half the size of WAV).',
      type: 'choice',
      default: 'mp3',
      choices: [
        { value: 'mp3', label: 'mp3' },
        { value: 'ogg', label: 'ogg' },
        { value: 'opus', label: 'opus' },
        { value: 'm4a', label: 'm4a' },
        { value: 'wav', label: 'wav' },
        { value: 'flac', label: 'flac' },
      ],
    },
    { ...bitrate, when: lossy },
    { ...sampleRate, when: (o) => o.format !== 'opus' },
    channels,
    {
      key: 'volume',
      label: 'Volume',
      help: 'Normalize makes quiet and loud files sound about equally loud (like streaming apps do). Louder and quieter change it by about double / half.',
      type: 'choice',
      default: 'keep',
      choices: [
        { value: 'keep', label: 'keep' },
        { value: 'normalize', label: 'normalize' },
        { value: 'louder', label: 'louder' },
        { value: 'quieter', label: 'quieter' },
      ],
    },
    { key: 'start', label: 'Start at', help: 'Cut off the beginning. Seconds (90) or minutes:seconds (1:30). Empty starts at the beginning.', type: 'text', default: '', placeholder: 'e.g. 0:05', mono: true },
    { key: 'end', label: 'End at', help: 'Cut off the end: the time in the original where it should stop. Empty goes to the end.', type: 'text', default: '', placeholder: 'e.g. 1:30', mono: true },
    { key: 'fadeIn', label: 'Fade in', help: 'Seconds to go from silence to full volume at the start. 0 = no fade.', type: 'number', min: 0, max: 60, default: 0, unit: 's' },
    { key: 'fadeOut', label: 'Fade out', help: 'Seconds to go quiet at the end. 0 = no fade.', type: 'number', min: 0, max: 60, default: 0, unit: 's' },
  ],
  run: ([file], opts, { signal }) => {
    const format = opts.format as AudioFormat;
    // Built now so typing mistakes in the times show up as the job's error right away.
    audioCommand(opts, 'in', 'out');
    return ffmpegJob(file, outputName(file.name, format), (i, o) => audioCommand(opts, i, o), AUDIO_MIME[format], signal);
  },
});
