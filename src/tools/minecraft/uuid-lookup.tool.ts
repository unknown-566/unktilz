import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'uuid-lookup',
  name: 'Player UUID lookup',
  category: 'minecraft',
  online: 'partly',
  order: 3,
  meta: 'name → uuid',
  description: 'Find a Java player’s UUID from their name, or the name from a UUID. Also gives the offline-mode UUID.',
  keywords: ['uuid', 'player', 'username', 'offline', 'mojang', 'profile'],
  component: lazyTool(() => import('./UuidLookup')),
});
