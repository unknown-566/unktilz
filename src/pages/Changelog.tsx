import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import changelog from '../../CHANGELOG.md?raw';
import { Markdown } from '../lib/markdown';
import { APP_VERSION, changelogSections, checkForUpdate, compareVersions, remoteChangelog } from '../lib/updates';

type Check = { state: 'idle' | 'checking' | 'error' } | { state: 'done'; latest: string; newer: { version: string; date: string; body: string }[] };

export default function Changelog() {
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const sections = changelogSections(changelog);

  useEffect(() => {
    document.title = 'Changelog · unktilz';
  }, []);

  const run = async () => {
    setCheck({ state: 'checking' });
    try {
      const info = await checkForUpdate();
      // Show what the newer versions bring, straight from the changelog on GitHub.
      const newer = info.newer ? changelogSections(await remoteChangelog()).filter((s) => compareVersions(s.version, APP_VERSION) > 0) : [];
      setCheck({ state: 'done', latest: info.latest, newer });
    } catch {
      setCheck({ state: 'error' });
    }
  };

  return (
    <div className="wrap tool-wrap">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/">tools</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">changelog</span>
      </nav>
      <div className="tool-head">
        <div className="title-row">
          <h1>Changelog</h1>
        </div>
        <p className="tool-desc">
          You have version <span className="mono accent">{APP_VERSION}</span>.
        </p>
      </div>

      <section className="panel" aria-label="Updates">
        <div className="opt-row">
          <h2 className="panel-title">// updates</h2>
          <button type="button" className="btn btn-primary" onClick={run} disabled={check.state === 'checking'}>
            {check.state === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
        {check.state === 'idle' && <p className="note">Asks GitHub which version is the newest. Needs the internet.</p>}
        {check.state === 'error' && (
          <p className="error-text" role="alert">
            Couldn’t reach GitHub. Check your internet connection and try again.
          </p>
        )}
        {check.state === 'done' && check.newer.length === 0 && (
          <p className="note" role="status" style={{ color: 'var(--fg)' }}>
            You’re up to date ({APP_VERSION} is the newest).
          </p>
        )}
        {check.state === 'done' && check.newer.length > 0 && (
          <div role="status" className="update-box">
            <p>
              <b>Version {check.latest} is out.</b> To update, close the site’s window and double-click <span className="mono">update.bat</span> in the unktilz folder. Your saved things stay.
            </p>
            {check.newer.map((s) => (
              <div key={s.version} className="changelog-entry">
                <h3 className="mono">
                  {s.version} <span className="muted">{s.date}</span>
                </h3>
                <Markdown text={s.body} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-label="What changed">
        <h2 className="panel-title">// what changed</h2>
        {sections.map((s) => (
          <div key={s.version} className="changelog-entry">
            <h3 className="mono">
              {s.version} <span className="muted">{s.date}</span>
              {s.version === APP_VERSION && <span className="pill">your version</span>}
            </h3>
            <Markdown text={s.body} />
          </div>
        ))}
      </section>
    </div>
  );
}
