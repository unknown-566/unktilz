import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'nether-portal',
  name: t('Nether portal calculator'),
  category: 'minecraft',
  order: 9,
  meta: t('xyz ÷ 8'),
  description: t('Work out where to build a linked portal: Overworld coordinates divide by 8 in the Nether.'),
  keywords: ['nether', 'portal', 'coordinates', 'link', 'overworld'],
  component: lazyTool(() => import('./NetherPortal')),
});
