import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Footer, Header } from './components/Header';
import { QueueRail } from './components/QueueRail';
import { TransitionProvider, scrollToTop } from './components/Transition';
import Home from './pages/Home';
import ToolPage from './pages/ToolPage';
import Request from './pages/Request';
import NotFound from './pages/NotFound';

const Backup = lazy(() => import('./pages/Backup'));
const Changelog = lazy(() => import('./pages/Changelog'));

function Shortcuts() {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const q = document.getElementById('q');
        if (q) q.focus();
        else navigate('/', { state: { focusSearch: true } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // New page starts at the top, except when the swap button only flipped the direction.
  useEffect(() => {
    if (!(state as { swap?: boolean } | null)?.swap) scrollToTop();
  }, [pathname, state]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <TransitionProvider>
        <Shortcuts />
        <div className="shell">
          <Header />
          <div className="body">
            <QueueRail />
            <div className="scroll" id="scroll">
              <main>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/t/:slug" element={<ToolPage />} />
                  <Route path="/request" element={<Request />} />
                  <Route
                    path="/changelog"
                    element={
                      <Suspense fallback={<div className="wrap muted mono">loading…</div>}>
                        <Changelog />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/backup"
                    element={
                      <Suspense fallback={<div className="wrap muted mono">loading…</div>}>
                        <Backup />
                      </Suspense>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </div>
        </div>
      </TransitionProvider>
    </BrowserRouter>
  );
}
