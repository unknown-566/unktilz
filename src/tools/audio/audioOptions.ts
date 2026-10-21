import type { Opts, OptionSchema } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export const audioOptions: OptionSchema[] = [
  {
    key: 'bitrate',
    help: t('How much data is used per second of sound. Higher sounds better but makes bigger files. 192 is good for music; 128 is plenty for speech.'),
    label: t('Bitrate'),
    hint: 'kbps',
    type: 'choice',
    default: '192',
    choices: ['128', '192', '256', '320'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'sampleRate',
    help: t('Samples per second. Keep the original unless something needs a specific rate: 44.1 kHz is CD quality, 48 kHz is the video standard.'),
    label: t('Sample rate'),
    type: 'choice',
    default: 'keep',
    choices: [
      { value: 'keep', label: t('keep original') },
      { value: '44100', label: t('44.1 kHz') },
      { value: '48000', label: t('48 kHz') },
    ],
  },
  {
    key: 'channels',
    help: t('Mono mixes everything into one channel: half the size, and Minecraft needs mono for sounds that come from a direction. Stereo keeps left and right separate.'),
    label: t('Channels'),
    type: 'choice',
    default: 'keep',
    choices: [
      { value: 'keep', label: t('keep original') },
      { value: '1', label: t('mono') },
      { value: '2', label: t('stereo') },
    ],
  },
];

export const audioArgs = (o: Opts) => [
  '-b:a', `${o.bitrate}k`,
  ...(o.sampleRate !== 'keep' ? ['-ar', String(o.sampleRate)] : []),
  ...(o.channels !== 'keep' ? ['-ac', String(o.channels)] : []),
];
