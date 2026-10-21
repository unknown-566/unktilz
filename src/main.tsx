import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The site's fonts ship with it (no request to Google Fonts, works offline).
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { initLang } from './lib/i18n';

// The language comes first: the tools translate their texts when their modules run.
void initLang().then(async () => {
  const [{ default: App }, { startRunner }] = await Promise.all([import('./App'), import('./queue/runner')]);
  startRunner();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
