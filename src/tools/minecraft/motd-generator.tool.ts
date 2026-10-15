import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'motd-generator',
  name: 'MOTD generator',
  category: 'minecraft',
  order: 5,
  meta: '§ codes',
  description: 'Write a colored two-line server MOTD, preview it like the server list, and copy it for server.properties.',
  keywords: ['motd', 'server list', 'description', 'color', 'server.properties'],
  layout: 'workbench',
  component: lazy(() => import('./MotdGenerator')),
});
