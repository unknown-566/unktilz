import { defineTool, lazyTool } from '../../registry/types';
import { IMAGE_ACCEPTS } from '../image/formats';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'images-to-pdf',
  name: t('Images to PDF'),
  category: 'pdf',
  order: 5,
  meta: t('.jpg → .pdf · scan'),
  beta: true,
  description:
    t('Turn photos into a PDF, one per page. A photo of a sheet of paper is cleaned up into a scan: straightened, with a white background.'),
  keywords: ['jpg to pdf', 'png to pdf', 'image to pdf', 'scan', 'scanner', 'photos', 'document', 'paper', 'homework', 'receipt', 'camscanner', 'heic to pdf'],
  accepts: IMAGE_ACCEPTS,
  layout: 'workbench',
  queued: true,
  component: lazyTool(() => import('./scan/ScanToPdf')),
});
