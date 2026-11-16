import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'timer',
  name: t('Timer, stopwatch & pomodoro'),
  category: 'everyday',
  order: 3,
  meta: t('countdown · laps · focus'),
  added: '2026-11-16',
  description: t('A timer that rings, a stopwatch with laps, and a pomodoro for focused work with breaks. They keep running while you use other tools, and show the time left in the tab’s title.'),
  keywords: ['timer', 'countdown', 'stopwatch', 'pomodoro', 'focus', 'alarm', 'kitchen timer', 'laps', 'stop watch', 'tomato', 'break', 'study timer'],
  component: lazyTool(() => import('./clock/Clock')),
});
