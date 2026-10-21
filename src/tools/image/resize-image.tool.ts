import { defineTool, type Opts } from '../../registry/types';
import { compute, computeValue } from '../../lib/compute';
import type { ImageFormat, ImagePayload } from '../../workers/tasks/image';
import { IMAGE_ACCEPTS } from './formats';
import { t } from '../../lib/i18n-core';

/** The job for one file; the preview runs exactly the same one. */
const payload = (file: File, o: Opts): ImagePayload => ({
  file,
  format: o.format as ImageFormat,
  quality: 92,
  resize:
    o.mode === 'percent'
      ? { mode: 'percent', percent: Number(o.percent) }
      : { mode: 'pixels', width: Number(o.width), height: Number(o.height), keepAspect: Boolean(o.keepAspect) },
});

export default defineTool({
  slug: 'resize-image',
  name: t('Resize image'),
  category: 'image',
  order: 4,
  meta: t('px · %'),
  description: t('Scale images by percent or to exact pixel sizes. Big downscales stay sharp.'),
  keywords: ['scale', 'dimensions', 'shrink', 'enlarge'],
  accepts: IMAGE_ACCEPTS,
  preview: async (file, o) => {
    const [out] = await computeValue('image', payload(file, o));
    return { blob: out.blob, bytes: true };
  },
  options: [
    {
      key: 'mode',
      help: t('Percent scales the image by a factor. Pixels sets an exact width and/or height.'),
      label: t('Resize by'),
      type: 'choice',
      default: 'percent',
      choices: [
        { value: 'percent', label: t('percent') },
        { value: 'pixels', label: t('pixels') },
      ],
    },
    { key: 'percent', help: t('Below 100 makes it smaller, above 100 bigger. Enlarging can’t add detail; the image just gets softer.'), label: t('Scale'), type: 'range', min: 5, max: 400, step: 5, default: 50, unit: '%', when: (o) => o.mode === 'percent' },
    { key: 'width', help: t('Target width in pixels. 0 means work it out from the height.'), label: t('Width'), type: 'number', min: 0, max: 16384, default: 1280, unit: 'px', when: (o) => o.mode === 'pixels' },
    { key: 'height', help: t('Target height in pixels. Leave it at 0 to work it out from the width, so the image isn’t stretched.'), label: t('Height'), type: 'number', min: 0, max: 16384, default: 0, unit: 'px', hint: t('0 = auto'), when: (o) => o.mode === 'pixels' },
    { key: 'keepAspect', help: t('On: the image fits inside the width × height box without stretching. Off: it’s forced to exactly that size.'), label: t('Keep aspect ratio'), type: 'toggle', default: true, when: (o) => o.mode === 'pixels' },
    {
      key: 'format',
      help: t('Same format keeps the original file type. Pick another to convert at the same time.'),
      label: t('Save as'),
      type: 'choice',
      default: 'keep',
      choices: [
        { value: 'keep', label: t('same format') },
        { value: 'png', label: 'png' },
        { value: 'jpeg', label: 'jpg' },
        { value: 'webp', label: 'webp' },
      ],
    },
  ],
  run: ([file], o, { signal }) => compute('image', payload(file, o), signal),
});
