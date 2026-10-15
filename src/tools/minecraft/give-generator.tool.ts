import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'give-generator',
  name: 'Give command generator',
  category: 'minecraft',
  order: 4.5,
  meta: 'item → /give',
  description: 'Build a custom item: name and lore with colors, enchantments, attributes, potions, trims, books, fireworks and spawn eggs with your own mob, then copy the /give command. Preview shows the tooltip like in game.',
  keywords: ['give', 'give command', 'item', 'custom item', 'mcstacker', 'enchant', 'nbt', 'components', 'potion', 'attributes', 'lore', 'command', 'spawn egg', 'mob', 'entity'],
  layout: 'workbench',
  component: lazyTool(() => import('./give/GiveGenerator')),
});
