import { useState } from 'react';

import { ProjectSetupHarnessPicker } from '@/features/home/components/molecules/project-setup-harness-picker';
import { sampleAgentHarnesses } from '@/features/home/demo/agent-harness.fixtures';
import type { AgentHarnessId } from '@/features/home/domain/agent-harness';

export default {}
export function HarnessPickerDemo(props: {
  defaultOrchestrator?: AgentHarnessId;
  defaultRememberOrchestrator?: boolean;
  defaultRememberWorker?: boolean;
  defaultWorker?: AgentHarnessId;
  onCancel?: () => void;
  projectPath?: string;
  showCancel?: boolean;
  starting?: boolean;
}) {
  const [orchestratorHarnessId, setOrchestratorHarnessId] = useState(
    props.defaultOrchestrator ?? 'claude-code'
  );
  const [workerHarnessId, setWorkerHarnessId] = useState(
    props.defaultWorker ?? 'codex'
  );
  const [rememberOrchestratorDefault, setRememberOrchestratorDefault] =
    useState(props.defaultRememberOrchestrator ?? false);
  const [rememberWorkerDefault, setRememberWorkerDefault] = useState(
    props.defaultRememberWorker ?? false
  );

  return (
    <ProjectSetupHarnessPicker
      harnesses={sampleAgentHarnesses}
      projectPath={props.projectPath ?? '~/Projects/reverbcode'}
      orchestratorHarnessId={orchestratorHarnessId}
      workerHarnessId={workerHarnessId}
      rememberOrchestratorDefault={rememberOrchestratorDefault}
      rememberWorkerDefault={rememberWorkerDefault}
      starting={props.starting}
      onOrchestratorChange={setOrchestratorHarnessId}
      onWorkerChange={setWorkerHarnessId}
      onRememberOrchestratorDefaultChange={setRememberOrchestratorDefault}
      onRememberWorkerDefaultChange={setRememberWorkerDefault}
      onCancel={props.showCancel ? props.onCancel : undefined}
      onStartProject={() => undefined}
    />
  );
}
