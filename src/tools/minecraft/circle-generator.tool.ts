import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'circle-generator',
  name: 'Circle & shape generator',
  category: 'minecraft',
  order: 12,
  meta: 'circles · spheres · domes',
  description:
    'Block-by-block guides for circles, ovals, polygons, stars and hearts, and layer by layer for spheres, domes, cylinders, cones, pyramids and donuts, with block counts.',
  keywords: [
    'circle', 'sphere', 'dome', 'oval', 'ellipse', 'pixel circle', 'build', 'cylinder', 'tower', 'cone', 'pyramid', 'torus', 'donut', 'ring',
    'polygon', 'hexagon', 'octagon', 'triangle', 'star', 'heart', 'ellipsoid', 'egg', 'shape generator',
  ],
  layout: 'workbench',
  component: lazyTool(() => import('./CircleGenerator')),
});
