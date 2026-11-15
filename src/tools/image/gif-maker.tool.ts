import { defineTool, lazyTool } from '../../registry/types';
import { IMAGE_ACCEPTS, VIDEO_ACCEPTS } from './formats';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'gif-maker',
  name: t('GIF maker'),
  category: 'image',
  order: 3,
  meta: t('video / photos → .gif'),
  added: '2026-10-18',
  beta: true,
  description: t('Make a GIF from a video or from photos. Add meme text and animated stickers, change the speed, crop it or play it back and forth. The preview shows exactly what you’ll get, and you get a link to share it.'),
  online: 'partly',
  keywords: ['gif', 'gif maker', 'giphy', 'photo to gif', 'photos to gif', 'images to gif', 'video to gif', 'mp4 to gif', 'meme', 'caption', 'text on gif', 'boomerang', 'animated', 'slideshow', 'sticker', 'stickers', 'animated emoji', 'rotate', 'overlay', 'font', 'fonts', 'google fonts', 'link', 'share', 'upload', 'discord'],
  accepts: [...IMAGE_ACCEPTS, ...VIDEO_ACCEPTS],
  layout: 'workbench',
  queued: true,
  component: lazyTool(() => import('./gif-maker/GifMaker')),
});
