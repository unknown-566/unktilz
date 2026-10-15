import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'server-status',
  name: 'Server status checker',
  category: 'minecraft',
  online: 'required',
  order: 1,
  meta: 'java · bedrock',
  description: 'Check if a Minecraft server is online and see its players, version and MOTD.',
  keywords: ['ping', 'online', 'players', 'motd', 'server'],
  component: lazyTool(() => import('./ServerStatus')),
});
