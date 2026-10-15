import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'stack-calculator',
  name: 'Stack & shulker calculator',
  category: 'minecraft',
  order: 15,
  meta: 'items → stacks',
  description: 'Turn an item count into stacks, shulker boxes and double chests, and back.',
  keywords: ['stacks', 'shulker', 'chest', 'items', 'inventory', 'storage'],
  component: lazy(() => import('./StackCalculator')),
});
