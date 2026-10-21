import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'seed-map',
  name: t('Seed map'),
  category: 'minecraft',
  order: 8,
  meta: t('seed → map'),
  description: t('See the biomes of any Java world seed and where villages, temples, monuments, ancient cities and other structures are. Click a spot for its coordinates.'),
  keywords: ['seed', 'seed map', 'biome', 'biome finder', 'map', 'village', 'structure', 'chunkbase', 'amidst', 'mansion', 'monument', 'ancient city'],
  layout: 'workbench',
  component: lazyTool(() => import('./seed-map/SeedMap')),
});
