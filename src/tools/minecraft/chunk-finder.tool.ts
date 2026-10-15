import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'chunk-finder',
  name: 'Chunk & region finder',
  category: 'minecraft',
  order: 10,
  meta: 'xyz → r.x.z',
  description: 'Find the chunk, section and region file (.mca) a block is in.',
  keywords: ['chunk', 'region', 'mca', 'coordinates', 'section', 'world file'],
  component: lazy(() => import('./ChunkFinder')),
});
