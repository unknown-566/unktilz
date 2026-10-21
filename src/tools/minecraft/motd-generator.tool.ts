import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'motd-generator',
  name: t('MOTD generator'),
  category: 'minecraft',
  order: 5,
  meta: t('§ codes'),
  description: t('Write a colored two-line server MOTD, preview it like the server list, and copy it for server.properties.'),
  keywords: ['motd', 'server list', 'description', 'color', 'server.properties'],
  layout: 'workbench',
  component: lazyTool(() => import('./MotdGenerator')),
});
