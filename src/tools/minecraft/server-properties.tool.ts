import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'server-properties',
  name: 'server.properties editor',
  category: 'minecraft',
  order: 19,
  meta: '.properties',
  description: 'Open your server.properties or start from the defaults, change settings with real controls, and save the file.',
  keywords: ['server.properties', 'config', 'server settings', 'whitelist', 'difficulty', 'gamemode'],
  component: lazyTool(() => import('./ServerProperties')),
});
