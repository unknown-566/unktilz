import { defineTool } from '../../registry/types';
import { compute } from '../../lib/compute';
import type { OrganizePdfPayload } from '../../workers/tasks/pdf';

const PAGES_HELP: Record<string, string> = {
  keep: 'Which pages to keep, in the order you want them: e.g. 3, 1-2, 5. A page can appear twice. Empty keeps all (use it to just rotate).',
  remove: 'Which pages to take out, e.g. 2, 5-6.',
  each: 'Every page becomes its own PDF. Empty does all pages, or pick some: e.g. 1-4.',
  groups: 'Each group becomes its own PDF, with ; between groups: e.g. 1-3; 4-6; 7-.',
};

export default defineTool({
  slug: 'split-pdf',
  name: 'Split & organize PDF',
  category: 'pdf',
  order: 3,
  meta: 'pages · split',
  description: 'Take pages out of a PDF, put them in another order, split it into several PDFs, or turn pages that are sideways.',
  keywords: ['split pdf', 'extract pages', 'remove pages', 'delete pages', 'reorder pages', 'rotate pdf', 'organize', 'separate'],
  accepts: ['.pdf'],
  options: [
    {
      key: 'mode',
      label: 'What to do',
      help: 'Pick pages: one PDF with only those pages, in your order. Remove pages: everything except those. Each page: one PDF per page. Groups: one PDF per group of pages.',
      type: 'choice',
      default: 'keep',
      choices: [
        { value: 'keep', label: 'pick pages' },
        { value: 'remove', label: 'remove pages' },
        { value: 'each', label: 'each page' },
        { value: 'groups', label: 'groups' },
      ],
    },
    ...Object.entries(PAGES_HELP).map(([mode, help]) => ({
      key: `pages_${mode}`,
      label: mode === 'remove' ? 'Pages to remove' : mode === 'groups' ? 'Groups' : 'Pages',
      help,
      type: 'text' as const,
      default: '',
      placeholder: { keep: 'all', remove: 'e.g. 2, 5-6', each: 'all', groups: 'e.g. 1-3; 4-6' }[mode],
      mono: true,
      when: (o: Record<string, unknown>) => o.mode === mode,
    })),
    {
      key: 'rotate',
      label: 'Turn pages',
      help: 'Turns every page in the result, e.g. for a scan that came out sideways.',
      type: 'choice',
      default: '0',
      choices: [
        { value: '0', label: 'no' },
        { value: '90', label: '90° right' },
        { value: '180', label: '180°' },
        { value: '270', label: '90° left' },
      ],
    },
  ],
  run: ([file], o, { signal }) =>
    compute(
      'organize-pdf',
      {
        file,
        mode: o.mode as OrganizePdfPayload['mode'],
        pages: String(o[`pages_${o.mode}`] ?? ''),
        rotate: Number(o.rotate) as OrganizePdfPayload['rotate'],
      },
      signal,
    ),
});
