import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { tokens, typography } from '@mini-erp/shared';
import App from './FoundationApp';
import './styles.css';
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/600.css';
import '@fontsource/hind-siliguri/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/700.css';
for (const [key, value] of Object.entries(tokens.color))
  document.documentElement.style.setProperty(`--${key}`, value);
for (const [key, value] of Object.entries(typography))
  document.documentElement.style.setProperty(
    `--type-${key}`,
    `${value / 16}rem`,
  );
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
