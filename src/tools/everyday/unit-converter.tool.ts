import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'unit-converter',
  name: t('Unit & currency converter'),
  category: 'everyday',
  order: 2,
  meta: t('length · weight · °C · money'),
  added: '2026-11-16',
  online: 'partly',
  description: t('Convert length, weight, temperature, area, volume, speed and time, and money with today’s exchange rates of the European Central Bank. See the amount in every unit at once.'),
  keywords: ['unit converter', 'convert', 'km to miles', 'miles to km', 'kg to lbs', 'celsius to fahrenheit', 'inches', 'feet', 'currency', 'exchange rate', 'eur', 'usd', 'czk', 'money', 'gallons', 'litres', 'mph', 'acres'],
  component: lazyTool(() => import('./units/UnitConverter')),
});
