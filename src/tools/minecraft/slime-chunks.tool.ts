import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'slime-chunks',
  name: 'Slime chunk finder',
  category: 'minecraft',
  order: 11,
  meta: 'seed',
  description: 'Map the slime chunks around you from your world seed (Java Edition).',
  keywords: ['slime', 'seed', 'farm', 'chunk', 'spawn'],
  layout: 'workbench',
  component: lazyTool(() => import('./SlimeChunks')),
});
