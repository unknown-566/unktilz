import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'summon-generator',
  name: t('Summon command generator'),
  category: 'minecraft',
  order: 4.6,
  added: '2026-10-24',
  beta: true,
  meta: t('entity → /summon'),
  description: t('Summon any mob or entity with your own name, health, gear, effects and riders: villagers with custom trades, posed armor stands, charged creepers, floating text and more. Copy the /summon command.'),
  keywords: ['summon', 'summon command', 'mcstacker', 'entity', 'mob', 'spawn', 'nbt', 'command', 'jockey', 'passengers', 'riders', 'armor stand', 'pose', 'villager', 'trades', 'text display', 'hologram', 'creeper', 'boss'],
  layout: 'workbench',
  component: lazyTool(() => import('./summon/SummonGenerator')),
});
