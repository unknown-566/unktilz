import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'advanced-server-list',
  name: t('AdvancedServerList profile generator'),
  category: 'minecraft',
  online: 'partly',
  order: 7,
  meta: t('ASL · profile.yml'),
  description:
    t('Build a profile for the AdvancedServerList plugin: MOTD, player count, hover text, favicon and conditions, with a live server-list preview.'),
  keywords: ['advancedserverlist', 'asl', 'motd', 'server list', 'minimessage', 'player count', 'hover', 'favicon', 'profile', 'paper', 'velocity'],
  layout: 'workbench',
  component: lazyTool(() => import('./AdvancedServerList')),
});
