import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'color-codes',
  name: 'Color codes & MiniMessage',
  category: 'minecraft',
  order: 6,
  meta: '§a · <green>',
  description: 'Every color and format code with its MiniMessage tag, plus a converter between the two.',
  keywords: ['color codes', 'formatting', 'minimessage', 'adventure', 'paper', 'chat colors', 'hex'],
  layout: 'workbench',
  component: lazyTool(() => import('./ColorCodes')),
});
