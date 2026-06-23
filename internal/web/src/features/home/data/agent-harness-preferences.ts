import type {
  AgentHarnessId,
  ProjectSetupHarnessSelection,
} from '@/features/home/domain/agent-harness';

const agentHarnessDefaultsStorageKey = 'yyork.home.agent-harness-defaults';
const agentHarnessDefaultsVersion = 1;

const agentHarnessIds: AgentHarnessId[] = ['claude-code', 'codex'];

export type AgentHarnessDefaults = Pick<
  ProjectSetupHarnessSelection,
  'orchestratorHarnessId' | 'workerHarnessId'
>;

interface StoredAgentHarnessDefaults extends Partial<AgentHarnessDefaults> {
  version?: number;
}

export function readAgentHarnessDefaults(): AgentHarnessDefaults | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const storedValue = window.localStorage.getItem(
      agentHarnessDefaultsStorageKey
    );
    if (!storedValue) {
      return undefined;
    }

    return normalizeAgentHarnessDefaults(JSON.parse(storedValue));
  } catch {
    return undefined;
  }
}

export function writeAgentHarnessDefaults(defaults: AgentHarnessDefaults) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      agentHarnessDefaultsStorageKey,
      JSON.stringify({
        ...normalizeAgentHarnessDefaults(defaults),
        version: agentHarnessDefaultsVersion,
      })
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function normalizeAgentHarnessDefaults(
  value: unknown
): AgentHarnessDefaults | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const stored = value as StoredAgentHarnessDefaults;
  const orchestratorHarnessId = normalizeAgentHarnessId(
    stored.orchestratorHarnessId
  );
  const workerHarnessId = normalizeAgentHarnessId(stored.workerHarnessId);

  if (!orchestratorHarnessId && !workerHarnessId) {
    return undefined;
  }

  return {
    orchestratorHarnessId:
      orchestratorHarnessId ?? ('claude-code' satisfies AgentHarnessId),
    workerHarnessId: workerHarnessId ?? ('codex' satisfies AgentHarnessId),
  };
}

function normalizeAgentHarnessId(value: unknown): AgentHarnessId | undefined {
  return typeof value === 'string' &&
    agentHarnessIds.includes(value as AgentHarnessId)
    ? (value as AgentHarnessId)
    : undefined;
}
