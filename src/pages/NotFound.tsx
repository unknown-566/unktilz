import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { openPalette } from '../components/CommandPalette';
import { HomeCrumb } from '../components/HomeCrumb';
import { SearchIcon } from '../components/icons';
import { ToolLink } from '../components/ToolLink';
import { GoLink } from '../components/Transition';
import { tools, type Tool } from '../registry';
import { t, tn } from '../lib/i18n';

/** Letters two words share at the same place from the start, for typos like "bitwize". */
const prefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** The tools whose address looks most like the one that was typed. */
function guesses(path: string): Tool[] {
  const words = decodeURIComponent(path)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && w !== 'tool' && w !== 'tools');
  if (!words.length) return [];
  return tools
    .map((tool) => {
      const parts = tool.slug.split('-');
      let score = 0;
      for (const w of words)
        for (const p of parts) {
          if (p === w) score += 6;
          else if (p.includes(w) || w.includes(p)) score += 3;
          else if (prefix(p, w) >= 3) score += prefix(p, w) - 1;
        }
      return { tool, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.tool);
}

export default function NotFound() {
  const { pathname } = useLocation();
  const close = useMemo(() => guesses(pathname), [pathname]);
  useEffect(() => {
    document.title = t('Not found · unktilz');
  }, []);
  return (
    <div className="wrap tool-wrap">
      <nav aria-label={t('Breadcrumb')} className="crumbs">
        <HomeCrumb />
        <span aria-hidden="true">/</span>
        <span aria-current="page">404</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>{tn('Nothing at {path}', { path: <span className="nf-path">{pathname}</span> })}</h1>
        </div>
        <p className="tool-desc">{t('That tool doesn\'t exist yet, or the link is wrong.')}</p>
      </div>
      <div className="inline">
        <button type="button" className="btn btn-primary" onClick={openPalette}>
          <SearchIcon />
          {t('Search tools')}
        </button>
        <GoLink to="/" className="btn">
          {t('All tools')}
        </GoLink>
        <GoLink to="/request" className="btn">
          {t('Request a tool')}
        </GoLink>
      </div>
      {close.length > 0 && (
        <section className="nf-guess" aria-label={t('Did you mean?')}>
          <div className="side-label">{t('// did you mean?')}</div>
          <div className="rel-grid">
            {close.map((tool) => (
              <ToolLink key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
