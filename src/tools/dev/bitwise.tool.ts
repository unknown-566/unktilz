import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'bitwise',
  name: t('Bitwise & bit shift'),
  category: 'dev',
  order: 5,
  meta: '& | ^ ~ << >>',
  description: t('AND, OR, XOR, NOT and bit shifts on 8, 16, 32 or 64-bit numbers, signed or not. See every bit, click one to flip it, and get the result in decimal, hex, binary and octal.'),
  keywords: ['bitwise', 'bit shift', 'shift left', 'shift right', 'and', 'or', 'xor', 'not', 'rotate', 'bits', 'binary', 'mask', 'two’s complement', 'bitmask'],
  added: '2026-11-15',
  layout: 'workbench',
  component: lazyTool(() => import('./bitwise/Bitwise')),
});
