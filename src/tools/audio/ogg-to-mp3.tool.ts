import { defineTool } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { swapExt } from '../../queue/download';
import { audioArgs, audioOptions } from './audioOptions';

export default defineTool({
  slug: 'ogg-to-mp3',
  name: 'OGG to MP3',
  category: 'audio',
  order: 1,
  meta: '.ogg → .mp3',
  description: 'Turn OGG files into MP3. Pick a bitrate, drop your files, download the results.',
  keywords: ['vorbis', 'audio', 'convert', 'minecraft sounds'],
  accepts: ['.ogg', '.oga', '.opus'],
  reverse: 'mp3-to-ogg',
  options: audioOptions,
  run: ([file], opts, { signal }) =>
    ffmpegJob(file, swapExt(file.name, 'mp3'), (i, o) => ['-i', i, '-vn', '-c:a', 'libmp3lame', ...audioArgs(opts), o], 'audio/mpeg', signal),
});
