import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'qr-code',
  name: t('QR code maker'),
  category: 'calc',
  order: 1,
  meta: t('link · Wi-Fi · contact · styles'),
  added: '2026-10-20',
  description:
    t('Make a QR code for a link, text, Wi-Fi, a contact, an e-mail, an SMS, a place, an event or a payment, in any colours and shapes, with your logo and a frame. It checks that phones can still read it.'),
  keywords: ['qr', 'qr code', 'qr generator', 'qr maker', 'wifi qr', 'vcard', 'contact qr', 'barcode', 'scan me', 'qr platba', 'payment qr', 'epc', 'sepa', 'logo qr', 'custom qr'],
  layout: 'workbench',
  component: lazyTool(() => import('./qr/QrMaker')),
});
