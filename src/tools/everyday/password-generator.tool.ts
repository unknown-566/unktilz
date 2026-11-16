import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'password-generator',
  name: t('Password generator'),
  category: 'everyday',
  order: 1,
  meta: t('characters · words · PIN · strength'),
  added: '2026-11-16',
  description: t('Make a strong password from characters, a few random words you can remember, or a PIN, and see how long it would take to guess. Or check a password you already have. Everything stays on your computer.'),
  keywords: ['password', 'password generator', 'passphrase', 'diceware', 'random password', 'strong password', 'pin', 'password strength', 'password checker', 'entropy', 'secure'],
  component: lazyTool(() => import('./password/PasswordGenerator')),
});
