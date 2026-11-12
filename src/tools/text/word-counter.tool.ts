import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'word-counter',
  name: t('Word counter'),
  category: 'text',
  order: 1,
  meta: t('words · characters · time'),
  description: t('Count words, characters, sentences and paragraphs as you type, see how long it takes to read, and which words you use most.'),
  keywords: ['word count', 'character count', 'letters', 'sentences', 'paragraphs', 'reading time', 'text length'],
  added: '2026-11-12',
  layout: 'workbench',
  component: lazyTool(() => import('./WordCounter')),
});
