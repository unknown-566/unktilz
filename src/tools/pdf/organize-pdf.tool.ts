import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'organize-pdf',
  name: t('Organize PDF'),
  category: 'pdf',
  order: 2,
  meta: t('move · turn · delete'),
  added: '2026-10-20',
  beta: true,
  description:
    t('See every page of a PDF and fix it: drag pages into a new order, turn the ones that are sideways, delete or duplicate pages, add empty pages, or put pages of several PDFs together.'),
  keywords: ['organize pdf', 'reorder pages', 'rearrange pdf', 'rotate pdf', 'rotate page', 'delete pages', 'remove pages', 'duplicate page', 'blank page', 'sort pages', 'move pages'],
  layout: 'workbench',
  component: lazyTool(() => import('./organize/Organize')),
});
