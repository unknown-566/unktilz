import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'uuid-lookup',
  name: t('Player UUID lookup'),
  category: 'minecraft',
  online: 'partly',
  order: 3,
  meta: t('name → uuid'),
  description: t('Find a Java player’s UUID from their name, or the name from a UUID. Also gives the offline-mode UUID.'),
  keywords: ['uuid', 'player', 'username', 'offline', 'mojang', 'profile'],
  component: lazyTool(() => import('./UuidLookup')),
});
