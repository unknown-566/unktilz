import { defineTool, lazyTool } from '../../registry/types';
import { IMAGE_ACCEPTS } from './formats';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'resize-image',
  name: t('Resize image'),
  category: 'image',
  order: 4,
  meta: t('px · % · presets'),
  description: t(
    'Make pictures smaller or bigger: by percent, to an exact width and height, or with a preset (Full HD, Instagram, YouTube…). Fill and crop to an exact size, pick the quality, and see the new file size before you save. Several pictures at once.',
  ),
  keywords: ['resize', 'scale', 'dimensions', 'shrink', 'enlarge', 'smaller', 'reduce size', 'full hd', 'instagram', 'thumbnail', 'width', 'height', 'compress'],
  accepts: IMAGE_ACCEPTS,
  layout: 'workbench',
  queued: true,
  component: lazyTool(() => import('./resize/ResizeImage')),
});
