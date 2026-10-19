import { defineTool } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { badName, badOptions, badVideoAttempts, badVideoCommand } from './badArgs';

export default defineTool({
  slug: 'bad-video',
  name: 'Make video bad',
  category: 'video',
  order: 2,
  meta: '144p · deep fried',
  added: '2026-10-19',
  description:
    'Ruin a video on purpose for memes: low quality, blurry, pixelated or deep fried, with bass boosted, earrape or phone call sound. Comes out as a small MP4.',
  keywords: [
    'low quality', 'bad quality', 'shitty', 'meme', 'deep fried', 'deepfry', 'pixelated', 'blurry', '144p', 'potato quality', 'crunchy',
    'earrape', 'ear rape', 'bass boosted', 'loud', 'distorted', 'compress video', 'ruin video',
  ],
  accepts: ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.3gp', '.ts', '.mts', '.mpg', '.mpeg', '.ogv', '.gif'],
  options: badOptions('video'),
  run: ([file], opts, { signal }) => {
    // Built now so typing mistakes in the times show up as the job's error right away.
    badVideoCommand(opts, 'in', 'out');
    return ffmpegJob(file, badName(file.name, 'mp4'), badVideoAttempts(opts), 'video/mp4', signal);
  },
});
