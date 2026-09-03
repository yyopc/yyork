export type AgentHarnessId = 'claude-code' | 'codex' | 'cursor';

export type AgentHarnessAvailability = 'available' | 'unavailable';

export type AgentHarnessOption = {
  availability: AgentHarnessAvailability;
  command: string;
  iconUrl?: string;
  id: AgentHarnessId;
  label: string;
  provider: string;
};

export type ProjectSetupHarnessSelection = {
  orchestratorHarnessId: AgentHarnessId;
  rememberOrchestratorDefault: boolean;
  rememberWorkerDefault: boolean;
  workerHarnessId: AgentHarnessId;
};
