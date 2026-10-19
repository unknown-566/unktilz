import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'bg-remover',
  name: 'Background remover',
  category: 'image',
  order: 4,
  meta: 'AI · colour · brush',
  added: '2026-10-19',
  beta: true,
  online: 'partly',
  description:
    'Remove the background of a photo: automatically with AI (runs on your computer), by clicking a colour with an adjustable tolerance, and fix the result by hand with an erase / restore brush. Save as a see-through PNG or on a colour.',
  keywords: [
    'remove background', 'background remover', 'remove bg', 'transparent background', 'cut out', 'cutout', 'png transparent', 'erase background', 'white background',
    'green screen', 'chroma key', 'magic wand', 'ai', 'birefnet', 'product photo', 'sticker',
  ],
  layout: 'workbench',
  component: lazyTool(() => import('./bg-remover/BgRemover')),
});
