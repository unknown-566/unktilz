import { t } from '../../lib/i18n-core';

/** Who a command is for (give, tellraw, title); "name" lets you type a player's name. */
export const TARGETS = [
  { value: '@p', label: t('@p · nearest player') },
  { value: '@s', label: t('@s · yourself') },
  { value: '@a', label: t('@a · every player') },
  { value: '@r', label: t('@r · random player') },
  { value: 'name', label: t('a specific player…') },
];
