import { defineTool } from '../../registry/types';
import { compute } from '../../lib/compute';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'merge-pdf',
  name: t('Merge PDF'),
  category: 'pdf',
  order: 1,
  meta: 'a + b',
  description: t('Combine PDFs into one file. Pages keep the order you pick the files in.'),
  keywords: ['combine', 'join', 'pdf'],
  accepts: ['.pdf'],
  batch: true,
  run: (files, _opts, { signal }) => compute('merge-pdf', { files }, signal),
});
