import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'circle-generator',
  name: 'Circle & sphere generator',
  category: 'minecraft',
  order: 12,
  meta: 'blocks',
  description: 'Block-by-block guides for circles, ovals and spheres, layer by layer, with block counts.',
  keywords: ['circle', 'sphere', 'dome', 'oval', 'ellipse', 'pixel circle', 'build'],
  layout: 'workbench',
  component: lazy(() => import('./CircleGenerator')),
});
