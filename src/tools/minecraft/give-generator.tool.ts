import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'give-generator',
  name: 'Give command generator',
  category: 'minecraft',
  order: 4.5,
  meta: 'item → /give',
  description: 'Build a custom item: name and lore with colors, enchantments, attributes, potions, trims, books and fireworks, then copy the /give command. Preview shows the tooltip like in game.',
  keywords: ['give', 'give command', 'item', 'custom item', 'mcstacker', 'enchant', 'nbt', 'components', 'potion', 'attributes', 'lore', 'command'],
  layout: 'workbench',
  component: lazyTool(() => import('./give/GiveGenerator')),
});
