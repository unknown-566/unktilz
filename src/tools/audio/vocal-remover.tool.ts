import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'vocal-remover',
  name: t('Vocal remover'),
  category: 'audio',
  order: 1.7,
  meta: t('karaoke · vocals only · AI'),
  added: '2026-11-16',
  beta: true,
  description: t('Split a song into the music and the singing, on your computer. Switch the vocals off for karaoke, keep only the vocals, or switch off single words and lines while the music plays on.'),
  keywords: ['vocal remover', 'remove vocals', 'lyrics remover', 'remove lyrics', 'karaoke', 'instrumental', 'acapella', 'a cappella', 'vocals only', 'isolate vocals', 'stems', 'stem splitter', 'split song', 'mute words', 'censor song', 'clean version', 'ai'],
  accepts: ['.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.weba', '.mp4', '.m4v', '.mov', '.webm', '.mkv'],
  layout: 'workbench',
  queued: true,
  component: lazyTool(() => import('./vocals/VocalRemover')),
});
