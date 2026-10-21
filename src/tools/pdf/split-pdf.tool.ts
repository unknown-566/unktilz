import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'split-pdf',
  name: t('Split PDF'),
  category: 'pdf',
  order: 3,
  meta: t('one → several'),
  beta: true,
  description: t('Cut a PDF into several PDFs: click between pages where it should split, or split it into single pages, every few pages or in half. Or pick pages and save just those.'),
  keywords: ['split pdf', 'extract pages', 'separate pdf', 'cut pdf', 'pdf pages', 'single pages', 'divide pdf', 'save pages'],
  layout: 'workbench',
  component: lazyTool(() => import('./split/Split')),
});
