import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'map-art',
  name: t('Map art converter'),
  category: 'minecraft',
  order: 16,
  meta: t('image → .litematic'),
  description: t('Turn a picture into Minecraft map art: see it in map colors, get the block list, and download a .litematic or .nbt to build from.'),
  keywords: ['map', 'map art', 'pixel art', 'schematic', 'litematic', 'litematica', 'nbt', 'structure', 'blocks', 'staircase'],
  accepts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'],
  layout: 'workbench',
  component: lazyTool(() => import('./MapArt')),
});
