import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'xp-calculator',
  name: t('XP level calculator'),
  category: 'minecraft',
  order: 14,
  meta: t('levels ⇄ points'),
  description: t('Convert experience levels to points and back, and see how much XP a level range costs.'),
  keywords: ['xp', 'experience', 'levels', 'points', 'enchanting', 'bottle o enchanting'],
  component: lazyTool(() => import('./XpCalculator')),
});
