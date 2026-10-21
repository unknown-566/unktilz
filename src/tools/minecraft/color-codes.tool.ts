import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'color-codes',
  name: t('Color codes & MiniMessage'),
  category: 'minecraft',
  order: 6,
  meta: t('§a · <green>'),
  description: t('Every color and format code with its MiniMessage tag, plus a converter between the two.'),
  keywords: ['color codes', 'formatting', 'minimessage', 'adventure', 'paper', 'chat colors', 'hex'],
  layout: 'workbench',
  component: lazyTool(() => import('./ColorCodes')),
});
