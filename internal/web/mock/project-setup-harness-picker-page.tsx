import { useState } from 'react';

import { FirstRunProjectCard } from '@/features/home/components/organisms/first-run-project-card';

export function ProjectSetupMockPage() {
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
