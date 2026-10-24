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
  description: t('Make a GIF from a video clip or from photos, with meme text in any Google font and animated stickers you can move, resize and turn. Speed, boomerang, crop and more; the preview shows exactly what you’ll get, and you get a link to share it.'),
  online: 'partly',
  keywords: ['gif', 'gif maker', 'giphy', 'photo to gif', 'photos to gif', 'images to gif', 'video to gif', 'mp4 to gif', 'meme', 'caption', 'text on gif', 'boomerang', 'animated', 'slideshow', 'sticker', 'stickers', 'animated emoji', 'rotate', 'overlay', 'font', 'fonts', 'google fonts', 'link', 'share', 'upload', 'discord'],
  accepts: [...IMAGE_ACCEPTS, ...VIDEO_ACCEPTS],
  layout: 'workbench',
  component: lazyTool(() => import('./gif-maker/GifMaker')),
});
