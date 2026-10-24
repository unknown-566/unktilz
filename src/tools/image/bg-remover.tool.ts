import { defineTool, lazyTool } from '../../registry/types';
import { IMAGE_ACCEPTS } from './formats';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'bg-remover',
  name: t('Background remover'),
  category: 'image',
  order: 4,
  meta: t('AI · colour · brush'),
  added: '2026-10-19',
  beta: true,
  online: 'partly',
  description:
    t('Remove the background of a photo: automatically with AI (runs on your computer), by clicking a colour with an adjustable tolerance, and fix the result by hand with an erase / restore brush. Save as a see-through PNG or on a colour.'),
  keywords: [
    'remove background', 'background remover', 'remove bg', 'transparent background', 'cut out', 'cutout', 'png transparent', 'erase background', 'white background',
    'green screen', 'chroma key', 'magic wand', 'ai', 'birefnet', 'product photo', 'sticker',
  ],
  accepts: IMAGE_ACCEPTS,
  layout: 'workbench',
  component: lazyTool(() => import('./bg-remover/BgRemover')),
});
