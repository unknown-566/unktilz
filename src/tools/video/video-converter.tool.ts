import { defineTool, type Opts } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { VIDEO_MIME, outputName, videoAttempts, type VideoFormat } from './videoArgs';
import { t } from '../../lib/i18n-core';

const gif = (o: Opts) => o.format === 'gif';
const notGif = (o: Opts) => o.format !== 'gif';

export default defineTool({
  slug: 'video-converter',
  name: t('Video converter'),
  category: 'video',
  order: 1,
  meta: t('mp4 · webm · mov · gif'),
  description:
    t('Convert videos to MP4, WebM, MOV, MKV or GIF, make them smaller, cut them shorter or remove the sound. Runs on your computer, on one CPU core: long or 4K videos take a while.'),
  keywords: [
    'mov to mp4', 'mkv to mp4', 'webm to mp4', 'avi to mp4', 'mp4 to webm', 'mp4 to gif', 'video to gif', 'gif to mp4', 'compress video', 'shrink video',
    'trim video', 'cut video', 'mute video', 'remove audio', 'resize video', '720p', '1080p', 'iphone video', 'hevc', 'convert',
  ],
  accepts: ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp', '.ts', '.mts', '.mpg', '.mpeg', '.ogv', '.gif'],
  options: [
    {
      key: 'format',
      label: t('Format'),
      help: t('MP4 plays everywhere (phones, Discord, browsers). WebM is for websites. MOV is for Apple apps, MKV keeps everything. GIF loops without sound.'),
      type: 'choice',
      default: 'mp4',
      choices: [
        { value: 'mp4', label: 'mp4' },
        { value: 'webm', label: 'webm' },
        { value: 'mov', label: 'mov' },
        { value: 'mkv', label: 'mkv' },
        { value: 'gif', label: 'gif' },
      ],
    },
    {
      key: 'quality',
      label: t('Quality'),
      help: t('Keep: if only the format changes, the video is copied as it is: instant and no quality lost. Otherwise it’s re-encoded in high quality. The others make the file smaller step by step: “small file” is good for sending in chats.'),
      type: 'choice',
      default: 'keep',
      when: notGif,
      choices: [
        { value: 'keep', label: t('keep') },
        { value: 'high', label: t('high') },
        { value: 'balanced', label: t('balanced') },
        { value: 'small', label: t('small file') },
      ],
    },
    {
      key: 'resolution',
      label: t('Resolution'),
      help: t('Makes the video smaller (never bigger). Works for upright phone videos too: 720p means the short side is 720 pixels.'),
      type: 'choice',
      default: 'keep',
      when: notGif,
      choices: [
        { value: 'keep', label: t('keep') },
        { value: '1080', label: '1080p' },
        { value: '720', label: '720p' },
        { value: '480', label: '480p' },
        { value: '360', label: '360p' },
      ],
    },
    {
      key: 'fps',
      label: t('Frame rate'),
      hint: 'fps',
      help: t('Frames per second. Fewer makes a smaller file; 30 is fine for most videos, 60 for games.'),
      type: 'choice',
      default: 'keep',
      when: notGif,
      choices: [
        { value: 'keep', label: t('keep') },
        { value: '60', label: '60' },
        { value: '30', label: '30' },
        { value: '24', label: '24' },
      ],
    },
    {
      key: 'gifFps',
      label: t('Frame rate'),
      hint: 'fps',
      help: t('More looks smoother but makes the GIF much bigger. 12 is a good balance.'),
      type: 'choice',
      default: '12',
      when: gif,
      choices: ['8', '12', '15', '24'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'gifWidth',
      label: t('Width'),
      hint: 'px',
      help: t('Width of the GIF; the height follows. GIFs grow fast, so smaller is usually better.'),
      type: 'choice',
      default: '480',
      when: gif,
      choices: [
        { value: '320', label: '320' },
        { value: '480', label: '480' },
        { value: '640', label: '640' },
        { value: 'keep', label: t('keep') },
      ],
    },
    { key: 'start', label: t('Start at'), help: t('Cut off the beginning. Seconds (90) or minutes:seconds (1:30). Empty starts at the beginning.'), type: 'text', default: '', placeholder: t('e.g. 0:05'), mono: true },
    { key: 'end', label: t('End at'), help: t('Cut off the end: the time in the original video where it should stop. Empty goes to the end.'), type: 'text', default: '', placeholder: t('e.g. 1:30'), mono: true },
    {
      key: 'audio',
      label: t('Sound'),
      help: t('Remove takes the sound out completely.'),
      type: 'choice',
      default: 'keep',
      when: notGif,
      choices: [
        { value: 'keep', label: t('keep') },
        { value: 'remove', label: t('remove') },
      ],
    },
  ],
  run: ([file], opts, { signal }) => {
    const format = opts.format as VideoFormat;
    return ffmpegJob(file, outputName(file.name, format), videoAttempts(opts), VIDEO_MIME[format], signal);
  },
});
