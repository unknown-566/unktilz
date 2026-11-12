import { defineTool, lazyTool } from '../../registry/types';
import { CUTTER_ACCEPTS } from './cutter/cutArgs';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'audio-cutter',
  name: t('Audio cutter'),
  category: 'audio',
  order: 1.5,
  meta: t('waveform · trim · cut out'),
  added: '2026-10-26',
  description: t('Cut a song or recording on its waveform: pick the part with the mouse, listen to it, then keep only that part or cut it out, with a fade in and out. For ringtones, clips and Minecraft sounds; works on videos too (takes their sound).'),
  keywords: ['cut audio', 'audio cutter', 'audio trimmer', 'trim mp3', 'cut mp3', 'mp3 cutter', 'trim audio', 'waveform', 'ringtone', 'ringtone maker', 'remove part', 'cut out', 'split audio', 'shorten song', 'clip', 'fade'],
  accepts: CUTTER_ACCEPTS,
  layout: 'workbench',
  component: lazyTool(() => import('./cutter/AudioCutter')),
});
