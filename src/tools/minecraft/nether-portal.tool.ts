import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'nether-portal',
  name: t('Nether portal calculator'),
  category: 'minecraft',
  order: 9,
  meta: t('xyz ÷ 8'),
  description: t('Work out where to build the second portal so the two link up: one block in the Nether is 8 blocks in the Overworld.'),
  keywords: ['nether', 'portal', 'coordinates', 'link', 'overworld'],
  component: lazyTool(() => import('./NetherPortal')),
});
