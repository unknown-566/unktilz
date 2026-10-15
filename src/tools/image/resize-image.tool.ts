import { defineTool } from '../../registry/types';
import { compute } from '../../lib/compute';
import type { ImageFormat } from '../../workers/tasks/image';
import { IMAGE_ACCEPTS } from './formats';

export default defineTool({
  slug: 'resize-image',
  name: 'Resize image',
  category: 'image',
  order: 4,
  meta: 'px · %',
  description: 'Scale images by percent or to exact pixel sizes. Big downscales stay sharp.',
  keywords: ['scale', 'dimensions', 'shrink', 'enlarge'],
  accepts: IMAGE_ACCEPTS,
  options: [
    {
      key: 'mode',
      help: 'Percent scales the image by a factor. Pixels sets an exact width and/or height.',
      label: 'Resize by',
      type: 'choice',
      default: 'percent',
      choices: [
        { value: 'percent', label: 'percent' },
        { value: 'pixels', label: 'pixels' },
      ],
    },
    { key: 'percent', help: 'Below 100 makes it smaller, above 100 bigger. Enlarging can’t add detail; the image just gets softer.', label: 'Scale', type: 'range', min: 5, max: 400, step: 5, default: 50, unit: '%', when: (o) => o.mode === 'percent' },
    { key: 'width', help: 'Target width in pixels. 0 means work it out from the height.', label: 'Width', type: 'number', min: 0, max: 16384, default: 1280, unit: 'px', when: (o) => o.mode === 'pixels' },
    { key: 'height', help: 'Target height in pixels. Leave it at 0 to work it out from the width, so the image isn’t stretched.', label: 'Height', type: 'number', min: 0, max: 16384, default: 0, unit: 'px', hint: '0 = auto', when: (o) => o.mode === 'pixels' },
    { key: 'keepAspect', help: 'On: the image fits inside the width × height box without stretching. Off: it’s forced to exactly that size.', label: 'Keep aspect ratio', type: 'toggle', default: true, when: (o) => o.mode === 'pixels' },
    {
      key: 'format',
      help: 'Same format keeps the original file type. Pick another to convert at the same time.',
      label: 'Save as',
      type: 'choice',
      default: 'keep',
      choices: [
        { value: 'keep', label: 'same format' },
        { value: 'png', label: 'png' },
        { value: 'jpeg', label: 'jpg' },
        { value: 'webp', label: 'webp' },
      ],
    },
  ],
  run: ([file], o, { signal }) =>
    compute(
      'image',
      {
        file,
        format: o.format as ImageFormat,
        quality: 92,
        resize:
          o.mode === 'percent'
            ? { mode: 'percent', percent: Number(o.percent) }
            : { mode: 'pixels', width: Number(o.width), height: Number(o.height), keepAspect: Boolean(o.keepAspect) },
      },
      signal,
    ),
});
