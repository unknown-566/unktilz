import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = 'Not found · unktilz';
  }, []);
  return (
    <div className="wrap tool-wrap">
      <div className="tool-head">
        <div className="kicker">// 404</div>
        <div className="title-row">
          <h1>Nothing at {pathname}</h1>
        </div>
        <p className="tool-desc">That tool doesn't exist yet, or the link is wrong.</p>
      </div>
      <div className="inline">
        <Link to="/" className="btn">
          All tools
        </Link>
        <Link to="/request" className="btn">
          Request a tool
        </Link>
      </div>
    </div>
  );
}
