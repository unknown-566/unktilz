import { lazy } from 'react';
import { defineTool } from '../../registry/types';

export default defineTool({
  slug: 'skin-editor',
  name: 'Skin editor',
  category: 'minecraft',
  order: 2.5,
  meta: '3D · .png',
  description: 'Paint a skin right on the 3D player, open two skins at once and copy a hat, jacket or any piece from one to the other. Ctrl+Z undoes anything.',
  keywords: ['skin', 'skin editor', 'paint', 'draw', 'texture', '3d', 'hat', 'alex', 'steve', 'slim', 'png'],
  layout: 'workbench',
  component: lazy(() => import('./skin-editor/SkinEditor')),
});
