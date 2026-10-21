import { defineTool } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { badAudioCommand, badName, badOptions } from '../video/badArgs';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'bad-audio',
  name: t('Make audio bad'),
  category: 'audio',
  order: 2,
  meta: t('earrape · bass boosted'),
  added: '2026-10-19',
  description:
    t('Ruin a sound on purpose for memes: crunchy low quality, bass boosted, earrape, phone call, underwater or robotic. Works on videos too (takes their sound). Comes out as a small MP3.'),
  keywords: [
    'earrape', 'ear rape', 'bass boosted', 'low quality', 'bad quality', 'shitty', 'meme', 'distorted', 'loud', 'crunchy', 'phone call', 'underwater',
    'bitcrush', 'robot voice', 'compress audio', 'ruin audio',
  ],
  accepts: [
    '.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wma', '.aif', '.aiff', '.amr', '.weba', '.mka',
    '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp',
  ],
  options: badOptions('audio'),
  run: ([file], opts, { signal }) => {
    // Built now so typing mistakes in the times show up as the job's error right away.
    badAudioCommand(opts, 'in', 'out');
    return ffmpegJob(file, badName(file.name, 'mp3'), (i, o) => badAudioCommand(opts, i, o), 'audio/mpeg', signal);
  },
});
