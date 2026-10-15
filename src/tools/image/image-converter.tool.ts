import { defineTool, type Opts } from '../../registry/types';
import { compute } from '../../lib/compute';
import type { ImageFormat } from '../../workers/tasks/image';
import { IMAGE_ACCEPTS } from './formats';
import { rasterizeSvg } from './svg';

// Canvas AVIF encoding is missing in most browsers; only offer it where it works.
const canAvif = typeof document !== 'undefined' && document.createElement('canvas').toDataURL('image/avif').startsWith('data:image/avif');
const LOSSY = new Set(['keep', 'jpeg', 'webp', 'avif']);
const ICO_SIZES: Record<string, number[]> = { favicon: [16, 32, 48], app: [16, 24, 32, 48, 64, 128, 256], big: [256] };

export default defineTool({
  slug: 'image-converter',
  name: 'Image converter',
  category: 'image',
  order: 2,
  meta: 'png · jpg · webp · ico',
  description:
    'Convert images to PNG, JPG, WebP, ICO or BMP, including iPhone photos (HEIC), TIFF and SVG. Can also make them smaller, turn and mirror them. The photo’s hidden info (camera, GPS location) is removed.',
  keywords: [
    'png to jpg', 'jpg to png', 'heic to jpg', 'heic', 'iphone photo', 'webp to png', 'webp to jpg', 'svg to png', 'png to ico', 'favicon', 'ico', 'tiff', 'bmp', 'avif',
    'compress image', 'rotate image', 'flip image', 'remove exif', 'gps', 'metadata', 'convert',
  ],
  accepts: [...IMAGE_ACCEPTS, '.svg'],
  options: [
    {
      key: 'format',
      help: 'Same keeps the format and just re-saves (with the quality below, that makes photos smaller). PNG keeps every pixel and transparency. JPG is smallest for photos, no transparency. WebP is smaller than both. ICO is for website and app icons. BMP is uncompressed, for old programs.',
      label: 'Format',
      type: 'choice',
      default: 'webp',
      choices: [
        { value: 'keep', label: 'same' },
        { value: 'png', label: 'png' },
        { value: 'jpeg', label: 'jpg' },
        { value: 'webp', label: 'webp' },
        ...(canAvif ? [{ value: 'avif', label: 'avif' }] : []),
        { value: 'ico', label: 'ico' },
        { value: 'bmp', label: 'bmp' },
      ],
    },
    {
      key: 'quality',
      help: 'Lower means a smaller file with more visible compression blur. 80–90 usually looks the same as the original. (PNG files saved as “same” stay lossless.)',
      label: 'Quality',
      type: 'range',
      min: 10,
      max: 100,
      step: 1,
      default: 90,
      unit: '%',
      when: (o: Opts) => LOSSY.has(String(o.format)),
    },
    {
      key: 'icoSizes',
      help: 'Website favicon: 16, 32 and 48 px. App icon: every size up to 256 px, for Windows shortcuts and programs. Non-square pictures are centred with transparent edges.',
      label: 'Icon sizes',
      type: 'choice',
      default: 'favicon',
      when: (o: Opts) => o.format === 'ico',
      choices: [
        { value: 'favicon', label: 'favicon (16–48)' },
        { value: 'app', label: 'app icon (16–256)' },
        { value: 'big', label: 'only 256' },
      ],
    },
    {
      key: 'rotate',
      help: 'Turns the picture. Phone photos already come out the right way up.',
      label: 'Rotate',
      type: 'choice',
      default: '0',
      choices: [
        { value: '0', label: 'no' },
        { value: '90', label: '90° right' },
        { value: '180', label: '180°' },
        { value: '270', label: '90° left' },
      ],
    },
    {
      key: 'flip',
      help: 'Mirrors the picture: left ↔ right, or upside down.',
      label: 'Mirror',
      type: 'choice',
      default: 'none',
      choices: [
        { value: 'none', label: 'no' },
        { value: 'h', label: 'left ↔ right' },
        { value: 'v', label: 'top ↕ bottom' },
      ],
    },
    {
      key: 'svgScale',
      help: 'Only for .svg files: how big to draw them. 1× is the size written in the file; 4× is good for sharp icons and logos.',
      label: 'SVG size',
      type: 'choice',
      default: '2',
      choices: [
        { value: '1', label: '1×' },
        { value: '2', label: '2×' },
        { value: '4', label: '4×' },
        { value: '8', label: '8×' },
      ],
    },
  ],
  run: ([file], opts, { signal }) => {
    const job = async function* () {
      const input = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml' ? await rasterizeSvg(file, Number(opts.svgScale) || 1) : file;
      yield* compute(
        'image',
        {
          file: input,
          format: opts.format as ImageFormat,
          // "Same" on a PNG stays lossless; quality only matters for lossy formats.
          quality: Number(opts.quality),
          rotate: Number(opts.rotate) as 0 | 90 | 180 | 270,
          flip: opts.flip as 'none' | 'h' | 'v',
          icoSizes: ICO_SIZES[String(opts.icoSizes)],
        },
        signal,
      );
    };
    return job();
  },
});
