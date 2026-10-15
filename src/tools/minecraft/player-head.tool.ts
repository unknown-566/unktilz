import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'player-head',
  name: 'Player head command',
  category: 'minecraft',
  online: 'partly',
  order: 4,
  meta: 'skin → /give',
  description: 'Get the /give command for any player’s head, in the right syntax for your version.',
  keywords: ['skull', 'head', 'give', 'command', 'skullowner'],
  component: lazyTool(() => import('./PlayerHead')),
});
