import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'json-formatter',
  name: t('JSON formatter & validator'),
  category: 'dev',
  order: 1,
  meta: '{ }',
  description: t('Pretty-print, minify or sort JSON, and see exactly where it breaks when it’s invalid.'),
  keywords: ['json', 'pretty print', 'beautify', 'minify', 'validate', 'lint'],
  layout: 'workbench',
  component: lazyTool(() => import('./JsonFormatter')),
});
