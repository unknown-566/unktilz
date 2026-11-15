import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'uuid-generator',
  name: t('UUID generator'),
  category: 'dev',
  order: 8,
  meta: 'v4 · v7',
  description: t('Make random IDs (UUID v4) or ones that sort by time (v7), one or a hundred at a time.'),
  keywords: ['uuid', 'guid', 'random id', 'v4', 'v7'],
  component: lazyTool(() => import('./UuidGenerator')),
});
