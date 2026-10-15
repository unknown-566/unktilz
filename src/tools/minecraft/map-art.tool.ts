import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'map-art',
  name: 'Map art converter',
  category: 'minecraft',
  order: 16,
  meta: 'image → .litematic',
  description: 'Turn a picture into Minecraft map art: see it in map colors, get the block list, and download a .litematic or .nbt to build from.',
  keywords: ['map', 'map art', 'pixel art', 'schematic', 'litematic', 'litematica', 'nbt', 'structure', 'blocks', 'staircase'],
  layout: 'workbench',
  component: lazy(() => import('./MapArt')),
});
