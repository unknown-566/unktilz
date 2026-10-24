import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'tellraw-generator',
  name: t('Tellraw & title generator'),
  category: 'minecraft',
  order: 4.7,
  added: '2026-10-24',
  meta: t('text → /tellraw /title'),
  description: t('Colored chat messages, titles and action bar text, with links and commands that run when clicked, text that shows when pointed at, player names and scores. Copy the /tellraw or /title command.'),
  keywords: ['tellraw', 'title', 'subtitle', 'actionbar', 'action bar', 'json text', 'raw json', 'text component', 'mcstacker', 'click event', 'hover', 'chat message', 'command', 'minimessage'],
  layout: 'workbench',
  component: lazyTool(() => import('./tellraw/TellrawGenerator')),
});
