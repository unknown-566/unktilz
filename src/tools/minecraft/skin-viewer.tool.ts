import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'skin-viewer',
  name: 'Skin viewer & downloader',
  category: 'minecraft',
  online: 'required',
  order: 2,
  meta: '.png',
  description: 'See any Java player’s skin from the front, as a head, or as the raw texture, and save the PNG.',
  keywords: ['skin', 'texture', 'avatar', 'download skin', 'player'],
  component: lazyTool(() => import('./SkinViewer')),
});
