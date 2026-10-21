import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'base64',
  name: t('Base64 encode / decode'),
  category: 'dev',
  order: 4,
  meta: 'b64',
  description: t('Encode text or files to Base64 and decode it back. Handles Unicode and the URL-safe alphabet.'),
  keywords: ['base64', 'encode', 'decode', 'b64', 'data url'],
  component: lazyTool(() => import('./Base64')),
});
