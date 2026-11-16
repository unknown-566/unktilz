import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'screen-recorder',
  name: t('Screen recorder'),
  category: 'video',
  order: 1.5,
  meta: t('screen · tab · microphone'),
  added: '2026-11-16',
  description: t('Record your screen, a window or a browser tab with the sound and your microphone, or just the microphone, right in the browser. The recording goes to the queue as MP4, WebM or MP3. Nothing is uploaded.'),
  keywords: ['screen recorder', 'record screen', 'screen capture', 'screencast', 'record tab', 'record window', 'microphone', 'voice recorder', 'record audio', 'obs', 'capture video', 'webcam'],
  queued: true,
  component: lazyTool(() => import('./recorder/ScreenRecorder')),
});
