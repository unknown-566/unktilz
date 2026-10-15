import { defineTool } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { swapExt } from '../../queue/download';
import { audioArgs, audioOptions } from './audioOptions';

export default defineTool({
  slug: 'mp3-to-ogg',
  name: 'MP3 to OGG',
  category: 'audio',
  order: 2,
  meta: '.mp3 → .ogg',
  description: 'Turn MP3 files into OGG Vorbis, the format Minecraft resource packs use for sounds.',
  keywords: ['vorbis', 'audio', 'convert', 'resource pack', 'sounds'],
  accepts: ['.mp3'],
  reverse: 'ogg-to-mp3',
  options: audioOptions,
  run: ([file], opts, { signal }) =>
    ffmpegJob(file, swapExt(file.name, 'ogg'), (i, o) => ['-i', i, '-vn', '-c:a', 'libvorbis', ...audioArgs(opts), o], 'audio/ogg', signal),
});
