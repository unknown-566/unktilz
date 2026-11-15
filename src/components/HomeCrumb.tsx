import { t } from '../lib/i18n-core';
import { HomeIcon } from './icons';
import { GoLink } from './Transition';

/** The first step of every breadcrumb: a house and "tools", back to the home page. */
export function HomeCrumb() {
  return (
    <GoLink to="/" className="crumb-home" title={t('Back to all tools')}>
      <HomeIcon />
      {t('tools')}
    </GoLink>
  );
}
