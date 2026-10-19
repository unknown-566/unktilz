import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startRunner } from './queue/runner';
// The site's fonts ship with it (no request to Google Fonts, works offline).
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

startRunner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
