import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'color-picker',
  name: t('Color picker'),
  category: 'color',
  order: 1,
  meta: t('hex · rgb · hsl · oklch'),
  added: '2026-11-11',
  description: t(
    'Everything about one color on one page: pick it, type or paste it, or take it from a picture or anywhere on the screen. See it as HEX, RGB, HSL, OKLCH, CMYK and more, check its contrast, get matching, lighter and darker colors, see how color-blind people see it, and get its Minecraft text code and map art block.',
  ),
  keywords: [
    'color picker', 'colour picker', 'hex to rgb', 'rgb to hex', 'hsl', 'hsv', 'oklch', 'cmyk', 'lab', 'color converter', 'eyedropper', 'pick color from image',
    'contrast', 'wcag', 'color blind', 'shades', 'tints', 'complementary', 'palette', 'minecraft color codes', 'map art', 'dyed leather',
  ],
  layout: 'workbench',
  component: lazyTool(() => import('./picker/ColorPicker')),
});
