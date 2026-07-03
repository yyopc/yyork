import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/app.css';
import 'slot-text/style.css';

import { WorkingSessionCardMockPage } from './working-session-card-page';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkingSessionCardMockPage />
  </StrictMode>
);
