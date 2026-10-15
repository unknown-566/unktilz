import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startRunner } from './queue/runner';
import './styles.css';

startRunner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
