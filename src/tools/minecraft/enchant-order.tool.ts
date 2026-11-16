import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'enchant-order',
  name: t('Enchantment order calculator'),
  category: 'minecraft',
  order: 14.5,
  meta: t('cheapest anvil order'),
  added: '2026-11-16',
  description: t('Pick an item and the enchantment books you want on it, and see the order to combine them in the anvil that costs the fewest levels and never hits "Too Expensive!".'),
  keywords: ['enchant', 'enchantment', 'enchanting', 'anvil', 'order', 'too expensive', 'books', 'combine', 'xp', 'levels', 'prior work penalty', 'mending'],
  component: lazyTool(() => import('./enchants/EnchantOrder')),
});
