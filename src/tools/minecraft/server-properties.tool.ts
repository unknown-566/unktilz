import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'server-properties',
  name: t('server.properties editor'),
  category: 'minecraft',
  order: 19,
  meta: t('.properties'),
  description: t('Open your server.properties or start from the defaults, change settings with real controls, and save the file.'),
  keywords: ['server.properties', 'config', 'server settings', 'whitelist', 'difficulty', 'gamemode'],
  component: lazyTool(() => import('./ServerProperties')),
});
