import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/tokens.css';
import './styles/shell.css';
import './clinical/styles/clinical.css';

const el = document.getElementById('root');
if (el === null) {
  throw new Error('Root element #root not found');
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);
