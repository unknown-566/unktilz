import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'uuid-generator',
  name: 'UUID generator',
  category: 'dev',
  order: 8,
  meta: 'v4 · v7',
  description: 'Generate random v4 or time-ordered v7 UUIDs, one or a hundred at a time.',
  keywords: ['uuid', 'guid', 'random id', 'v4', 'v7'],
  component: lazyTool(() => import('./UuidGenerator')),
});
