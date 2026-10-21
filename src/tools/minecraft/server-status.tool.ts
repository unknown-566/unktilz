import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'server-status',
  name: t('Server status checker'),
  category: 'minecraft',
  online: 'required',
  order: 1,
  meta: t('java · bedrock'),
  description: t('Check if a Minecraft server is online and see its players, version and MOTD.'),
  keywords: ['ping', 'online', 'players', 'motd', 'server'],
  component: lazyTool(() => import('./ServerStatus')),
});
