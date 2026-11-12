import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'image-palette',
  name: t('Palette from image'),
  category: 'color',
  order: 2,
  meta: t('main colors · css · gpl'),
  added: '2026-11-11',
  description: t(
    'Drop or paste a picture and get its main colors: how much of the picture each one covers and where it is. Copy them as HEX, CSS variables, JSON or Tailwind, or download the palette as a PNG or a GIMP / Inkscape palette.',
  ),
  keywords: ['palette', 'color palette', 'colour palette', 'palette from image', 'palette extractor', 'dominant colors', 'main colors', 'extract colors', 'image colors', 'color scheme', 'gpl', 'tailwind colors'],
  layout: 'workbench',
  component: lazyTool(() => import('./palette/ImagePalette')),
});
