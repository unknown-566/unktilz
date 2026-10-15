import { defineTool } from '../../registry/types';
import { compute, computeValue } from '../../lib/compute';
import { isHeic, isTiff } from '../../workers/tasks/imageCodecs';
import type { ScanLook } from '../../workers/tasks/scan';
import { IMAGE_ACCEPTS } from '../image/formats';

const scan = (o: Record<string, unknown>) => o.mode === 'scan';

export default defineTool({
  slug: 'images-to-pdf',
  name: 'Images to PDF',
  category: 'pdf',
  order: 5,
  meta: '.jpg → .pdf',
  description: 'Put images into one PDF, one per page. Photos of paper can be cleaned up so they read like a scan.',
  keywords: ['jpg to pdf', 'png to pdf', 'scan', 'photos', 'document', 'scanner', 'paper', 'homework'],
  accepts: IMAGE_ACCEPTS,
  batch: true,
  preview: async (file, o) => {
    if (o.mode === 'scan') return { blob: await computeValue('scan-preview', { file, look: o.look as ScanLook, crop: Boolean(o.crop) }), note: 'this page in the PDF' };
    // Photos go in as they are; HEIC and TIFF need drawing first to be shown.
    const blob = isHeic(file) || isTiff(file) ? (await computeValue('image-preview', { file, max: 2400 })).blob : file;
    return { blob, note: 'this page in the PDF' };
  },
  options: [
    {
      key: 'mode',
      help: 'Document scan is for photos of paper: it finds the sheet, straightens it and makes the background white. Photo as-is puts each image on its page unchanged.',
      label: 'Pages',
      type: 'choice',
      default: 'scan',
      choices: [
        { value: 'scan', label: 'document scan' },
        { value: 'photo', label: 'photo as-is' },
      ],
    },
    {
      key: 'look',
      help: 'Color keeps stamps and highlighter. Grayscale is the cleanest for most text. Black & white gives the sharpest, smallest pages but can lose faint pencil.',
      label: 'Look',
      type: 'choice',
      default: 'gray',
      when: scan,
      choices: [
        { value: 'color', label: 'color' },
        { value: 'gray', label: 'grayscale' },
        { value: 'bw', label: 'black & white' },
      ],
    },
    { key: 'crop', help: 'Finds the edges of the paper, cuts away the table and corrects a photo taken at an angle. Turn it off if it cuts off part of the page.', label: 'Find the paper and straighten it', type: 'toggle', default: true, when: scan },
    {
      key: 'page',
      help: 'Fit image makes each page exactly the size of its image. A4 and Letter are standard paper; wide images get a sideways page.',
      label: 'Page size',
      type: 'choice',
      default: 'a4',
      choices: [
        { value: 'fit', label: 'fit image' },
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'Letter' },
      ],
    },
    {
      key: 'margin',
      help: 'White space around the image on each page.',
      label: 'Margin',
      type: 'choice',
      default: '0',
      choices: [
        { value: '0', label: 'none' },
        { value: '24', label: 'small' },
        { value: '56', label: 'large' },
      ],
    },
  ],
  run: (files, o, { signal }) =>
    compute(
      'images-to-pdf',
      {
        files,
        page: o.page as 'fit' | 'a4' | 'letter',
        margin: Number(o.margin),
        mode: o.mode === 'photo' ? 'photo' : 'scan',
        look: o.look as ScanLook,
        crop: Boolean(o.crop),
      },
      signal,
    ),
});
