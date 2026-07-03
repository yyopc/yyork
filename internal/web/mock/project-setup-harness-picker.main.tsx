import { createRoot } from 'react-dom/client';

import '@/styles/app.css';

import { MockDesignShell } from './mock-design-shell';
import { ProjectSetupMockPage } from './project-setup-harness-picker-page';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <MockDesignShell>
    <ProjectSetupMockPage />
  </MockDesignShell>
);
