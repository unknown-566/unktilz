import { defineTool } from '../../registry/types';
import { ffmpegJob } from '../../lib/ffmpeg';
import { swapExt } from '../../queue/download';

export default defineTool({
  slug: 'video-to-gif',
  name: 'Video to GIF',
  category: 'video',
  order: 4,
  meta: '→ .gif',
  description: 'Turn a short clip into a looping GIF with a palette built from the video itself.',
  keywords: ['mp4', 'webm', 'mov', 'animated', 'gif'],
  accepts: ['.mp4', '.webm', '.mov', '.mkv', '.m4v'],
  options: [
    {
      key: 'fps',
      help: 'Frames per second. More looks smoother but makes the GIF much bigger. 12 is a good balance.',
      label: 'Frame rate',
      hint: 'fps',
      type: 'choice',
      default: '12',
      choices: ['8', '12', '15', '24'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'width',
      help: 'Width of the GIF in pixels; the height follows automatically. GIFs grow fast, so smaller is usually better.',
      label: 'Width',
      hint: 'px',
      type: 'choice',
      default: '480',
      choices: [
        { value: '320', label: '320' },
        { value: '480', label: '480' },
        { value: '640', label: '640' },
        { value: 'keep', label: 'keep' },
      ],
    },
  ],
  run: ([file], opts, { signal }) => {
    const scale = opts.width === 'keep' ? '' : `,scale=${opts.width}:-2:flags=lanczos`;
    const vf = `fps=${opts.fps}${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
    return ffmpegJob(file, swapExt(file.name, 'gif'), (i, o) => ['-i', i, '-vf', vf, '-loop', '0', o], 'image/gif', signal);
  },
});
