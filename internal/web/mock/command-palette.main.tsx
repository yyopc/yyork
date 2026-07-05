import { createRoot } from 'react-dom/client';

import '@/styles/app.css';

import { CommandPaletteMockPage } from './command-palette-page';
import { MockDesignShell } from './mock-design-shell';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <MockDesignShell>
    <CommandPaletteMockPage />
  </MockDesignShell>
);
