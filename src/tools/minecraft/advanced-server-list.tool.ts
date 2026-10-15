import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'advanced-server-list',
  name: 'AdvancedServerList profile generator',
  category: 'minecraft',
  online: 'partly',
  order: 7,
  meta: 'ASL · profile.yml',
  description:
    'Build a profile for the AdvancedServerList plugin: MOTD, player count, hover text, favicon and conditions, with a live server-list preview.',
  keywords: ['advancedserverlist', 'asl', 'motd', 'server list', 'minimessage', 'player count', 'hover', 'favicon', 'profile', 'paper', 'velocity'],
  layout: 'workbench',
  component: lazy(() => import('./AdvancedServerList')),
});
