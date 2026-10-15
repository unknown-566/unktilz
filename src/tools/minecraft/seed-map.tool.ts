import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'seed-map',
  name: 'Seed map',
  category: 'minecraft',
  order: 8,
  meta: 'seed → map',
  description: 'See the biomes of any Java world seed and where villages, temples, monuments, ancient cities and other structures are. Click a spot for its coordinates.',
  keywords: ['seed', 'seed map', 'biome', 'biome finder', 'map', 'village', 'structure', 'chunkbase', 'amidst', 'mansion', 'monument', 'ancient city'],
  layout: 'workbench',
  component: lazy(() => import('./seed-map/SeedMap')),
});
