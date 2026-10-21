import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'skin-viewer',
  name: t('Skin viewer & downloader'),
  category: 'minecraft',
  online: 'required',
  order: 2,
  meta: '.png',
  description: t('See any Java player’s skin from the front, as a head, or as the raw texture, and save the PNG.'),
  keywords: ['skin', 'texture', 'avatar', 'download skin', 'player'],
  component: lazyTool(() => import('./SkinViewer')),
});
