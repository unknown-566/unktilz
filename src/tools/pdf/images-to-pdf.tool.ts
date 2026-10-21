import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'images-to-pdf',
  name: t('Images to PDF'),
  category: 'pdf',
  order: 5,
  meta: t('.jpg → .pdf · scan'),
  beta: true,
  description:
    t('Turn photos into a PDF, one per page. Photos of paper become clean scans: the sheet is found (or you drag its corners), straightened and made white, or only what’s written on it is put on a clean page inside the margins.'),
  keywords: ['jpg to pdf', 'png to pdf', 'image to pdf', 'scan', 'scanner', 'photos', 'document', 'paper', 'homework', 'receipt', 'camscanner', 'heic to pdf'],
  layout: 'workbench',
  component: lazyTool(() => import('./scan/ScanToPdf')),
});
