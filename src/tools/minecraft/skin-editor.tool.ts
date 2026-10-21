import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'skin-editor',
  name: t('Skin editor'),
  category: 'minecraft',
  online: 'partly',
  order: 2.5,
  meta: t('3D · .png'),
  description: t('Paint a skin right on the 3D player, open two skins at once and copy a hat, jacket or any piece from one to the other. Ctrl+Z undoes anything.'),
  keywords: ['skin', 'skin editor', 'paint', 'draw', 'texture', '3d', 'hat', 'alex', 'steve', 'slim', 'png'],
  layout: 'workbench',
  component: lazyTool(() => import('./skin-editor/SkinEditor')),
});
