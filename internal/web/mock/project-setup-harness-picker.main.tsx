import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/app.css';

import { FirstRunProjectCard } from '@/features/home/components/organisms/first-run-project-card';

import { MockDesignShell } from './mock-design-shell';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

function ProjectSetupMockPage() {
  const [phase, setPhase] = useState<'empty' | 'agents'>('empty');

  return (
    <div
      className="flex min-h-dvh min-w-0 items-center justify-center p-6"
      data-design="canvas"
    >
      <FirstRunProjectCard
        phase={phase}
        projectPath="~/Projects/reverbcode"
        onAddProject={() => {
          setPhase('agents');
        }}
        onChangeProject={() => {
          setPhase('empty');
        }}
        onStartProject={() => undefined}
      />
    </div>
  );
}

createRoot(rootElement).render(
  <MockDesignShell>
    <ProjectSetupMockPage />
  </MockDesignShell>
);
