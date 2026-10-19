import { defineTool } from '../../registry/types';
import { compute } from '../../lib/compute';

export default defineTool({
  slug: 'merge-pdf',
  name: 'Merge PDF',
  category: 'pdf',
  order: 1,
  meta: 'a + b',
  beta: true,
  description: 'Combine PDFs into one file. Pages keep the order you pick the files in.',
  keywords: ['combine', 'join', 'pdf'],
  accepts: ['.pdf'],
  batch: true,
  run: (files, _opts, { signal }) => compute('merge-pdf', { files }, signal),
});
