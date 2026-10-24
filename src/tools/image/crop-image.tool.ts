import { defineTool, lazyTool } from '../../registry/types';
import { IMAGE_ACCEPTS } from './formats';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'crop-image',
  name: t('Crop image'),
  category: 'image',
  order: 5,
  meta: t('1:1 · 16:9 · circle'),
  added: '2026-10-24',
  description: t(
    'Cut out the part of a picture you want: drag the box or type exact pixels, lock a ratio (1:1, 16:9, 4:5…), turn and mirror, crop round for a profile picture, and save at an exact size. Several pictures at once, with the same crop if you like.',
  ),
  keywords: ['crop', 'crop image', 'cut', 'trim', 'square', 'aspect ratio', 'profile picture', 'avatar', 'circle crop', 'round', 'rotate', 'flip', 'mirror', 'instagram', 'thumbnail', 'screenshot'],
  accepts: IMAGE_ACCEPTS,
  layout: 'workbench',
  component: lazyTool(() => import('./crop/CropImage')),
});
