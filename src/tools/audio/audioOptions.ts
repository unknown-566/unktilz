import type { Opts, OptionSchema } from '../../registry/types';

export const audioOptions: OptionSchema[] = [
  {
    key: 'bitrate',
    help: 'How much data is used per second of sound. Higher sounds better but makes bigger files. 192 is good for music; 128 is plenty for speech.',
    label: 'Bitrate',
    hint: 'kbps',
    type: 'choice',
    default: '192',
    choices: ['128', '192', '256', '320'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'sampleRate',
    help: 'Samples per second. Keep the original unless something needs a specific rate: 44.1 kHz is CD quality, 48 kHz is the video standard.',
    label: 'Sample rate',
    type: 'choice',
    default: 'keep',
    choices: [
      { value: 'keep', label: 'keep original' },
      { value: '44100', label: '44.1 kHz' },
      { value: '48000', label: '48 kHz' },
    ],
  },
  {
    key: 'channels',
    help: 'Mono mixes everything into one channel: half the size, and Minecraft needs mono for sounds that come from a direction. Stereo keeps left and right separate.',
    label: 'Channels',
    type: 'choice',
    default: 'keep',
    choices: [
      { value: 'keep', label: 'keep original' },
      { value: '1', label: 'mono' },
      { value: '2', label: 'stereo' },
    ],
  },
];

export const audioArgs = (o: Opts) => [
  '-b:a', `${o.bitrate}k`,
  ...(o.sampleRate !== 'keep' ? ['-ar', String(o.sampleRate)] : []),
  ...(o.channels !== 'keep' ? ['-ac', String(o.channels)] : []),
];
