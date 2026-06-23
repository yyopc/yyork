import { cn } from '@/lib/tailwind/utils';

import { ProjectSetupAgentsCard } from '@/features/home/components/molecules/project-setup-agents-card';
import { NoProjectsEmptyState } from '@/features/home/components/organisms/no-projects-empty-state';
import type { AddProjectSource } from '@/features/home/domain/add-project';
import type { ProjectSetupHarnessSelection } from '@/features/home/domain/agent-harness';

export type FirstRunProjectCardPhase = 'empty' | 'agents';

export function FirstRunProjectCard(props: {
  agentSetup?: ProjectSetupHarnessSelection;
  className?: string;
  onAddProject?: (source?: AddProjectSource) => void | Promise<void>;
  onAgentSetupChange?: (selection: ProjectSetupHarnessSelection) => void;
  onChangeProject?: () => void;
  onStartProject?: (selection: ProjectSetupHarnessSelection) => void;
  phase: FirstRunProjectCardPhase;
  projectPath?: string;
  starting?: boolean;
}) {
  const isEmpty = props.phase === 'empty';

  return (
    <div
      className={cn(
        'relative mx-auto min-h-[504px] w-full max-w-[488px] min-w-0',
        props.className
      )}
    >
      <div
        className="t-page-slide relative h-full min-h-[504px] w-full"
        data-page={isEmpty ? '1' : '2'}
      >
        <section
          className="t-page absolute inset-0 flex items-center justify-center"
          data-page-id="1"
        >
          <NoProjectsEmptyState onAddProject={props.onAddProject} />
        </section>
        <section
          className="t-page absolute inset-0 flex items-center justify-center bg-background p-6"
          data-page-id="2"
        >
          <ProjectSetupAgentsCard
            agentSetup={props.agentSetup}
            projectPath={props.projectPath ?? ''}
            starting={props.starting}
            onAgentSetupChange={props.onAgentSetupChange}
            onChangeProject={props.onChangeProject}
            onStartProject={props.onStartProject}
          />
        </section>
      </div>
    </div>
  );
}
