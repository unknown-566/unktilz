import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'json-formatter',
  name: 'JSON formatter & validator',
  category: 'dev',
  order: 1,
  meta: '{ }',
  description: 'Pretty-print, minify or sort JSON, and see exactly where it breaks when it’s invalid.',
  keywords: ['json', 'pretty print', 'beautify', 'minify', 'validate', 'lint'],
  layout: 'workbench',
  component: lazyTool(() => import('./JsonFormatter')),
});
