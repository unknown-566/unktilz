import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'chunk-finder',
  name: t('Chunk & region finder'),
  category: 'minecraft',
  order: 10,
  meta: t('xyz → r.x.z'),
  description: t('Find the chunk, section and region file (.mca) a block is in.'),
  keywords: ['chunk', 'region', 'mca', 'coordinates', 'section', 'world file'],
  component: lazyTool(() => import('./ChunkFinder')),
});
