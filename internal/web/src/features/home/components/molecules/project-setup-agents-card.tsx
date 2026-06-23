import { useState } from 'react';

import { ProjectSetupCardShell } from '@/features/home/components/molecules/project-setup-card-shell';
import { ProjectSetupHarnessPicker } from '@/features/home/components/molecules/project-setup-harness-picker';
import { sampleAgentHarnesses } from '@/features/home/demo/agent-harness.fixtures';
import type {
  AgentHarnessId,
  ProjectSetupHarnessSelection,
} from '@/features/home/domain/agent-harness';

export function ProjectSetupAgentsCard(props: {
  agentSetup?: ProjectSetupHarnessSelection;
  onAgentSetupChange?: (selection: ProjectSetupHarnessSelection) => void;
  onCancel?: () => void;
  onChangeProject?: () => void;
  onStartProject?: (selection: ProjectSetupHarnessSelection) => void;
  projectPath: string;
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

  return (
    <ProjectSetupCardShell data-testid="project-setup-card">
      <ProjectSetupHarnessPicker
        className="min-h-0 flex-1"
        harnesses={sampleAgentHarnesses}
        projectPath={props.projectPath}
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
        onCancel={props.onCancel}
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
  );
}
