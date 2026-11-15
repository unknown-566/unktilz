import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'json-formatter',
  name: t('JSON formatter & validator'),
  category: 'dev',
  order: 1,
  meta: '{ }',
  description: t('Make JSON easy to read, squeeze it onto one line or sort its keys, and see exactly where the mistake is when it’s broken.'),
  keywords: ['json', 'pretty print', 'beautify', 'minify', 'validate', 'lint'],
  layout: 'workbench',
  component: lazyTool(() => import('./JsonFormatter')),
});
