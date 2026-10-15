import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Request() {
  useEffect(() => {
    document.title = 'Request a tool · unktilz';
  }, []);
  return (
    <div className="wrap tool-wrap">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/">tools</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">request</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>Request a tool</h1>
        </div>
        <p className="tool-desc">Missing something you keep searching for? Soon you'll be able to suggest it here.</p>
      </div>
      <section className="panel" aria-labelledby="soon">
        <h2 id="soon" className="panel-title">
          // coming soon
        </h2>
        <p className="note" style={{ color: 'var(--fg)' }}>
          Tool requests aren't open yet. Check back later.
        </p>
      </section>
    </div>
  );
}
