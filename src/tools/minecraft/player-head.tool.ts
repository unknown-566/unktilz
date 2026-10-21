import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'player-head',
  name: t('Player head command'),
  category: 'minecraft',
  online: 'partly',
  order: 4,
  meta: t('skin → /give'),
  description: t('Get the /give command for any player’s head, in the right syntax for your version.'),
  keywords: ['skull', 'head', 'give', 'command', 'skullowner'],
  component: lazyTool(() => import('./PlayerHead')),
});
