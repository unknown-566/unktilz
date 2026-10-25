import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'resource-pack',
  name: t('Resource pack maker'),
  category: 'minecraft',
  online: 'partly',
  order: 2.7,
  added: '2026-10-25',
  beta: true,
  meta: t('textures → .zip'),
  description: t('Make your own Minecraft resource pack: repaint any texture or put in your own picture, add your own items for /give, swap sounds, rename things, change the menu background and splash texts, then download the pack as a .zip.'),
  keywords: ['resource pack', 'texture pack', 'texturepack', 'resourcepack', 'textures', 'pack.mcmeta', 'pack.png', 'pixel art', 'block texture', 'item texture', 'hd', 'retexture', 'zip', 'sounds', 'sound pack', 'custom items', 'item_model', 'panorama', 'title screen', 'splash', 'lang', 'rename items'],
  layout: 'workbench',
  component: lazyTool(() => import('./resource-pack/ResourcePack')),
});
