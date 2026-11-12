import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'gradient',
  name: t('Gradient generator'),
  category: 'color',
  order: 3,
  meta: t('css · tailwind · svg · png'),
  added: '2026-11-12',
  description: t(
    'Make a linear, radial or conic gradient: add and drag its colors, set the angle, and blend them in sRGB, OKLab or OKLCH so the middle doesn’t go grey. Start from a ready one, a random one or your own colors, then copy the CSS, a Tailwind class or SVG, or download it as a PNG in any size.',
  ),
  keywords: ['gradient', 'gradient generator', 'css gradient', 'linear gradient', 'radial gradient', 'conic gradient', 'color gradient', 'background', 'tailwind gradient', 'oklch gradient', 'mesh', 'wallpaper'],
  layout: 'workbench',
  component: lazyTool(() => import('./gradient/Gradient')),
});
