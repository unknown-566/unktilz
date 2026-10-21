import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'slime-chunks',
  name: t('Slime chunk finder'),
  category: 'minecraft',
  order: 11,
  meta: t('seed'),
  description: t('Map the slime chunks around you from your world seed (Java Edition).'),
  keywords: ['slime', 'seed', 'farm', 'chunk', 'spawn'],
  layout: 'workbench',
  component: lazyTool(() => import('./SlimeChunks')),
});
