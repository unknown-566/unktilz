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
        <p className="tool-desc">Missing something you keep searching for? Tell us what it should take in and what it should give back.</p>
      </div>
      <section className="panel" aria-labelledby="how">
        <h2 id="how" className="panel-title">
          // how
        </h2>
        <p className="note" style={{ color: 'var(--fg)' }}>
          Email <span className="mono accent">[CONTACT EMAIL]</span> or open an issue at <span className="mono accent">[REPO URL]</span>.
        </p>
        <p className="note">Include the tool name, an example input, and the output you expect.</p>
      </section>
    </div>
  );
}
