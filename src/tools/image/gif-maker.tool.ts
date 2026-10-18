import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'gif-maker',
  name: 'GIF maker',
  category: 'image',
  order: 3,
  meta: 'video / photos → .gif',
  description: 'Make a GIF from a video clip or from photos, with meme text, emoji stickers, speed, boomerang and crop. The preview shows exactly what you’ll get.',
  keywords: ['gif', 'gif maker', 'giphy', 'photo to gif', 'photos to gif', 'images to gif', 'video to gif', 'mp4 to gif', 'meme', 'caption', 'text on gif', 'boomerang', 'animated', 'slideshow', 'sticker'],
  layout: 'workbench',
  component: lazyTool(() => import('./gif-maker/GifMaker')),
});
