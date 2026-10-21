import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'circle-generator',
  name: t('Circle & shape generator'),
  category: 'minecraft',
  order: 12,
  meta: t('circles · spheres · domes'),
  description:
    t('Block-by-block guides for circles, ovals, polygons, stars and hearts, and layer by layer for spheres, domes, cylinders, cones, pyramids and donuts, with block counts.'),
  keywords: [
    'circle', 'sphere', 'dome', 'oval', 'ellipse', 'pixel circle', 'build', 'cylinder', 'tower', 'cone', 'pyramid', 'torus', 'donut', 'ring',
    'polygon', 'hexagon', 'octagon', 'triangle', 'star', 'heart', 'ellipsoid', 'egg', 'shape generator',
  ],
  layout: 'workbench',
  component: lazyTool(() => import('./CircleGenerator')),
});
