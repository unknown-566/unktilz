import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'base64',
  name: 'Base64 encode / decode',
  category: 'dev',
  order: 4,
  meta: 'b64',
  description: 'Encode text or files to Base64 and decode it back. Handles Unicode and the URL-safe alphabet.',
  keywords: ['base64', 'encode', 'decode', 'b64', 'data url'],
  component: lazy(() => import('./Base64')),
});
