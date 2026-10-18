import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'gif-maker',
  name: 'GIF maker',
  category: 'image',
  order: 3,
  meta: 'video / photos → .gif',
  description: 'Make a GIF from a video clip or from photos, with meme text and animated stickers you can move, resize and turn. Speed, boomerang, crop and more; the preview shows exactly what you’ll get.',
  online: 'partly',
  keywords: ['gif', 'gif maker', 'giphy', 'photo to gif', 'photos to gif', 'images to gif', 'video to gif', 'mp4 to gif', 'meme', 'caption', 'text on gif', 'boomerang', 'animated', 'slideshow', 'sticker', 'stickers', 'animated emoji', 'rotate', 'overlay'],
  layout: 'workbench',
  component: lazyTool(() => import('./gif-maker/GifMaker')),
});
