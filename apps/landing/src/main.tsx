import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prerender (scripts/prerender.mjs) bakes the home page into #root at build time
// so crawlers see real content. When that markup is present we hydrate it back
// into the normal CSR app; otherwise (prerender skipped/failed, self-contained
// HTML, etc.) we do a clean client render. Probing for children keeps both paths
// free of hydration-mismatch warnings — and keeps old projects unaffected.
const rootEl = document.getElementById('root')!;
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, <App />);
} else {
  createRoot(rootEl).render(<App />);
}
