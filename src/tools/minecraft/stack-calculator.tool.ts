import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'stack-calculator',
  name: t('Stack & shulker calculator'),
  category: 'minecraft',
  order: 15,
  meta: t('items → stacks'),
  description: t('Turn an item count into stacks, shulker boxes and double chests, and back.'),
  keywords: ['stacks', 'shulker', 'chest', 'items', 'inventory', 'storage'],
  component: lazyTool(() => import('./StackCalculator')),
});
