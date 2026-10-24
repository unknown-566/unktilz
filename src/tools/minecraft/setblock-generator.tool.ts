import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'setblock-generator',
  name: t('Setblock & fill generator'),
  category: 'minecraft',
  order: 4.8,
  added: '2026-10-24',
  meta: t('block → /setblock /fill'),
  description: t('Place a block or fill an area: block states, signs with (clickable) text, chests with items or loot, spawners with your own mob, command blocks, player heads. Big areas are split into several /fill commands.'),
  keywords: ['setblock', 'fill', 'block', 'block states', 'sign', 'chest', 'loot table', 'spawner', 'command block', 'player head', 'hollow', 'replace', 'mcstacker', 'command'],
  layout: 'workbench',
  component: lazyTool(() => import('./setblock/SetblockGenerator')),
});
