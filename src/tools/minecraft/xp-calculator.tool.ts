import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'xp-calculator',
  name: 'XP level calculator',
  category: 'minecraft',
  order: 14,
  meta: 'levels ⇄ points',
  description: 'Convert experience levels to points and back, and see how much XP a level range costs.',
  keywords: ['xp', 'experience', 'levels', 'points', 'enchanting', 'bottle o enchanting'],
  component: lazyTool(() => import('./XpCalculator')),
});
