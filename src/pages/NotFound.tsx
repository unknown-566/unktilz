import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GoLink } from '../components/Transition';
import { t, tn } from '../lib/i18n';

export default function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = t('Not found · unktilz');
  }, []);
  return (
    <div className="wrap tool-wrap">
      <div className="tool-head">
        <div className="kicker">// 404</div>
        <div className="title-row">
          <h1>{tn('Nothing at {path}', { path: pathname })}</h1>
        </div>
        <p className="tool-desc">{t('That tool doesn\'t exist yet, or the link is wrong.')}</p>
      </div>
      <div className="inline">
        <GoLink to="/" className="btn">
          {t('All tools')}
        </GoLink>
        <GoLink to="/request" className="btn">
          {t('Request a tool')}
        </GoLink>
      </div>
    </div>
  );
}
