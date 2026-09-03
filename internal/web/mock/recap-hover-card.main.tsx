import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';

import '@/styles/app.css';
import '@videojs/react/video/minimal-skin.css';
import './recap-hover-card.css';

import { MockDesignShell } from './mock-design-shell';
import { RecapHoverCardMockPage } from './recap-hover-card-page';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <MockDesignShell showThemeToolbar={false}>
    <RecapHoverCardMockPage />
  </MockDesignShell>
);
