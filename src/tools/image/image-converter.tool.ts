import { defineTool } from '../../registry/types';
import { compute } from '../../lib/compute';
import type { ImageFormat } from '../../workers/tasks/image';
import { IMAGE_ACCEPTS } from './formats';

// Canvas AVIF encoding is missing in most browsers; only offer it where it works.
const canAvif = typeof document !== 'undefined' && document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');

export default defineTool({
  slug: 'image-converter',
  name: 'Image converter',
  category: 'image',
  order: 2,
  meta: 'png · jpg · webp',
  description: 'Convert images between PNG, JPG and WebP (and AVIF where your browser supports it). Transparent areas turn white in JPG.',
  keywords: ['png to jpg', 'jpg to png', 'webp', 'avif', 'convert'],
  accepts: IMAGE_ACCEPTS,
  options: [
    {
      key: 'format',
      help: 'PNG is lossless and keeps transparency. JPG is smallest for photos but has no transparency. WebP is smaller than both and keeps transparency.',
      label: 'Format',
      type: 'choice',
      default: 'webp',
      choices: [
        { value: 'png', label: 'png' },
        { value: 'jpeg', label: 'jpg' },
        { value: 'webp', label: 'webp' },
        ...(canAvif ? [{ value: 'avif', label: 'avif' }] : []),
      ],
    },
    { key: 'quality', help: 'Lower means a smaller file with more visible compression blur. 80–90 usually looks the same as the original.', label: 'Quality', type: 'range', min: 10, max: 100, step: 1, default: 90, unit: '%', when: (o) => o.format !== 'png' },
  ],
  run: ([file], opts, { signal }) =>
    compute('image', { file, format: opts.format as ImageFormat, quality: Number(opts.quality) }, signal),
});
