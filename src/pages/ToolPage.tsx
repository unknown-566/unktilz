import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ALIASES, categoryLabel, getTool, related } from '../registry';
import { useLaunch } from '../components/Transition';
import { loadFileTool, preloadTool } from '../registry/preload';

const FileTool = lazy(() => loadFileTool().then((m) => ({ default: m.FileTool })));
import { SwapIcon } from '../components/icons';
import { prefersReducedMotion } from '../lib/theme';
import NotFound from './NotFound';

const GLYPHS = '<>/\\[]{}=+*#01_';

/** Title decodes from random glyphs, left to right, whenever the text changes. */
function useScramble(text: string, delay: number) {
  const [frame, setFrame] = useState<number | null>(prefersReducedMotion() ? null : 0);
  const first = useRef(true);
  useEffect(() => {
    if (prefersReducedMotion()) return setFrame(null);
    const total = 14;
    let f = 0;
    let iv: number;
    setFrame(0);
    const t = window.setTimeout(
      () => {
        iv = window.setInterval(() => {
          f++;
          if (f > total) {
            clearInterval(iv);
            setFrame(null);
          } else setFrame(f / total);
        }, 32);
      },
      first.current ? delay : 0,
    );
    first.current = false;
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [text, delay]);

  if (frame === null) return text;
  const shown = Math.floor(frame * text.length);
  return text
    .split('')
    .map((ch, i) => (i < shown || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
    .join('');
}

export default function ToolPage() {
  const { slug } = useParams();
  const tool = getTool(slug);
  const alias = slug ? ALIASES[slug] : undefined;
  if (!tool && alias) return <Navigate to={`/t/${alias.to}`} replace state={{ opts: alias.opts }} />;
  if (!tool) return <NotFound />;
  return <ToolView key={tool.reverse ? [tool.slug, tool.reverse].sort().join('|') : tool.slug} slug={tool.slug} />;
}

// A tool and its reverse share one view, so swapping keeps the arrow rotation and options.
function ToolView({ slug }: { slug: string }) {
  const tool = getTool(slug)!;
  const navigate = useNavigate();
  const location = useLocation();
  const launch = useLaunch();
  const [rot, setRot] = useState(0);
  const title = useScramble(tool.name, (location.state as { swap?: boolean } | null)?.swap ? 0 : 380);

  useEffect(() => {
    document.title = `${tool.name} · unktilz`;
  }, [tool.name]);

  const reverse = getTool(tool.reverse);
  const swap = () => {
    if (!reverse) return;
    setRot((r) => r + 180);
    navigate(`/t/${reverse.slug}`, { replace: true, state: { swap: true } });
  };

  const cat = categoryLabel(tool.category).toLowerCase();
  const wide = tool.layout === 'workbench';

  const relatedLinks = related(tool, 4).map((t) => (
    <a key={t.slug} className="rel" href={`/t/${t.slug}`} onClick={(e) => launch(e, t.slug)} onMouseEnter={() => preloadTool(t)} onFocus={() => preloadTool(t)}>
      <span>{t.name}</span>
      <span className="card-meta">{t.meta}</span>
    </a>
  ));

  const head = (
    <div className="tool-head">
      <div className="title-row">
        <h1 aria-label={tool.name}>
          <span aria-hidden="true">{title}</span>
        </h1>
        {reverse && (
          <button type="button" className="swap" onClick={swap} aria-label={`Swap direction: ${reverse.name}`}>
            <SwapIcon rotate={rot} />
            <span>swap</span>
          </button>
        )}
      </div>
      <p className="tool-desc">{tool.description}</p>
    </div>
  );

  const body = tool.run ? (
    <Suspense fallback={<div className="panel muted mono">loading…</div>}>
      <FileTool tool={tool} />
    </Suspense>
  ) : tool.component ? (
    <Suspense fallback={<div className="panel muted mono">loading…</div>}>
      <tool.component />
    </Suspense>
  ) : null;

  const crumbs = (
    <nav aria-label="Breadcrumb" className="crumbs">
      <Link to="/">tools</Link>
      <span aria-hidden="true">/</span>
      <Link to={`/?cat=${tool.category}`}>{cat}</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{tool.slug}</span>
    </nav>
  );

  // Workbench tools need the full width for editor + preview, so related tools go underneath.
  if (wide)
    return (
      <div className="wrap wide tool-wrap">
        {crumbs}
        {head}
        {body}
        <section className="related-row" aria-label="Related tools">
          <div className="side-label">// related</div>
          <div className="rel-grid">{relatedLinks}</div>
        </section>
      </div>
    );

  return (
    <div className="wrap tool-wrap">
      {crumbs}
      <div className="tool-cols">
        <div className="tool-main">
          {head}
          {body}
        </div>
        <aside className="tool-side" aria-label="Related tools">
          <div className="side-label">// related</div>
          {relatedLinks}
        </aside>
      </div>
    </div>
  );
}
