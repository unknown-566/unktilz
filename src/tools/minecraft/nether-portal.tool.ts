import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'nether-portal',
  name: 'Nether portal calculator',
  category: 'minecraft',
  order: 9,
  meta: 'xyz ÷ 8',
  description: 'Work out where to build a linked portal: Overworld coordinates divide by 8 in the Nether.',
  keywords: ['nether', 'portal', 'coordinates', 'link', 'overworld'],
  component: lazyTool(() => import('./NetherPortal')),
});
