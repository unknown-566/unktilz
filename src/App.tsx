import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Footer, Header } from './components/Header';
import { QueueRail } from './components/QueueRail';
import { TransitionProvider, scrollToTop } from './components/Transition';
import Home from './pages/Home';
import ToolPage from './pages/ToolPage';
import Request from './pages/Request';
import NotFound from './pages/NotFound';
import { hasUnseenVersion } from './components/whatsNewSeen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageError } from './components/PageError';
import { t } from './lib/i18n-core';

/** A page that fails while drawing shows an error instead of blanking the site; another page starts fresh. */
function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} fallback={(reset, error) => <PageError error={error} onRetry={reset} />}>
      {children}
    </ErrorBoundary>
  );
}

const Backup = lazy(() => import('./pages/Backup'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Settings = lazy(() => import('./pages/Settings'));
const WhatsNew = lazy(() => import('./components/WhatsNew'));

/** The "what's new" popup, once per new version (loaded only then). */
function NewVersionPopup() {
  const [show, setShow] = useState(hasUnseenVersion);
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <WhatsNew onClose={() => setShow(false)} />
    </Suspense>
  );
}

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
        <NewVersionPopup />
        <div className="shell">
          <Header />
          <div className="body">
            <QueueRail />
            <div className="scroll" id="scroll">
              <main>
                <PageBoundary>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/t/:slug" element={<ToolPage />} />
                    <Route path="/request" element={<Request />} />
                    <Route
                      path="/changelog"
                      element={
                        <Suspense fallback={<div className="wrap muted mono">{t('loading…')}</div>}>
                          <Changelog />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <Suspense fallback={<div className="wrap muted mono">{t('loading…')}</div>}>
                          <Settings />
                        </Suspense>
                      }
                    />
                    <Route
                      path="/backup"
                      element={
                        <Suspense fallback={<div className="wrap muted mono">{t('loading…')}</div>}>
                          <Backup />
                        </Suspense>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </PageBoundary>
              </main>
              <Footer />
            </div>
          </div>
        </div>
      </TransitionProvider>
    </BrowserRouter>
  );
}
