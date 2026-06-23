import { useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { ProjectSetupCardShell } from '@/features/home/components/molecules/project-setup-card-shell';
import { ProjectSetupHarnessPicker } from '@/features/home/components/molecules/project-setup-harness-picker';
import { NoProjectsEmptyState } from '@/features/home/components/organisms/no-projects-empty-state';
import { sampleAgentHarnesses } from '@/features/home/demo/agent-harness.fixtures';
import type { AddProjectSource } from '@/features/home/domain/add-project';
import type {
  AgentHarnessId,
  ProjectSetupHarnessSelection,
} from '@/features/home/domain/agent-harness';

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
  const [localOrchestratorHarnessId, setLocalOrchestratorHarnessId] =
    useState<AgentHarnessId>('claude-code');
  const [localWorkerHarnessId, setLocalWorkerHarnessId] =
    useState<AgentHarnessId>('codex');
  const [
    localRememberOrchestratorDefault,
    setLocalRememberOrchestratorDefault,
  ] = useState(false);
  const [localRememberWorkerDefault, setLocalRememberWorkerDefault] =
    useState(false);

  const orchestratorHarnessId =
    props.agentSetup?.orchestratorHarnessId ?? localOrchestratorHarnessId;
  const workerHarnessId =
    props.agentSetup?.workerHarnessId ?? localWorkerHarnessId;
  const rememberOrchestratorDefault =
    props.agentSetup?.rememberOrchestratorDefault ??
    localRememberOrchestratorDefault;
  const rememberWorkerDefault =
    props.agentSetup?.rememberWorkerDefault ?? localRememberWorkerDefault;

  const updateAgentSetup = (patch: Partial<ProjectSetupHarnessSelection>) => {
    const nextSelection: ProjectSetupHarnessSelection = {
      orchestratorHarnessId,
      rememberOrchestratorDefault,
      rememberWorkerDefault,
      workerHarnessId,
      ...patch,
    };

    if (props.onAgentSetupChange) {
      props.onAgentSetupChange(nextSelection);
      return;
    }

    if (patch.orchestratorHarnessId !== undefined) {
      setLocalOrchestratorHarnessId(patch.orchestratorHarnessId);
    }
    if (patch.workerHarnessId !== undefined) {
      setLocalWorkerHarnessId(patch.workerHarnessId);
    }
    if (patch.rememberOrchestratorDefault !== undefined) {
      setLocalRememberOrchestratorDefault(patch.rememberOrchestratorDefault);
    }
    if (patch.rememberWorkerDefault !== undefined) {
      setLocalRememberWorkerDefault(patch.rememberWorkerDefault);
    }
  };

  const isEmpty = props.phase === 'empty';

  return (
    <div
      className={cn(
        'relative mx-auto min-h-[504px] w-full max-w-[488px] min-w-0',
        props.className
      )}
    >
      <div
        className="t-page-slide relative min-h-[504px] w-full"
        data-page={isEmpty ? '1' : '2'}
      >
        <section className="t-page absolute inset-0" data-page-id="1">
          <NoProjectsEmptyState
            className="absolute inset-0"
            onAddProject={props.onAddProject}
          />
        </section>
        <section
          className="t-page absolute inset-0 flex items-center justify-center bg-background p-6"
          data-page-id="2"
        >
          <ProjectSetupCardShell data-testid="project-setup-card">
            <ProjectSetupHarnessPicker
              className="min-h-0 flex-1"
              harnesses={sampleAgentHarnesses}
              projectPath={props.projectPath ?? ''}
              orchestratorHarnessId={orchestratorHarnessId}
              workerHarnessId={workerHarnessId}
              rememberOrchestratorDefault={rememberOrchestratorDefault}
              rememberWorkerDefault={rememberWorkerDefault}
              starting={props.starting}
              onOrchestratorChange={(harnessId) => {
                updateAgentSetup({ orchestratorHarnessId: harnessId });
              }}
              onWorkerChange={(harnessId) => {
                updateAgentSetup({ workerHarnessId: harnessId });
              }}
              onRememberOrchestratorDefaultChange={(remember) => {
                updateAgentSetup({ rememberOrchestratorDefault: remember });
              }}
              onRememberWorkerDefaultChange={(remember) => {
                updateAgentSetup({ rememberWorkerDefault: remember });
              }}
              onChangeProject={props.onChangeProject}
              onStartProject={() => {
                props.onStartProject?.({
                  orchestratorHarnessId,
                  rememberOrchestratorDefault,
                  rememberWorkerDefault,
                  workerHarnessId,
                });
              }}
            />
          </ProjectSetupCardShell>
        </section>
      </div>
    </div>
  );
}
