import type {
  AgentHarnessId,
  ProjectSetupHarnessSelection,
} from '@/features/home/domain/agent-harness';

const firstRunProjectSetupDraftStorageKey =
  'yyork.home.first-run-project-setup-draft';
const firstRunProjectSetupDraftVersion = 1;

const agentHarnessIds: AgentHarnessId[] = ['claude-code', 'codex'];

export type FirstRunProjectSetupDraft = ProjectSetupHarnessSelection & {
  projectPath: string;
};

interface StoredFirstRunProjectSetupDraft extends Partial<FirstRunProjectSetupDraft> {
  version?: number;
}

export const defaultFirstRunProjectSetupSelection: ProjectSetupHarnessSelection =
  {
    orchestratorHarnessId: 'claude-code',
    rememberOrchestratorDefault: false,
    rememberWorkerDefault: false,
    workerHarnessId: 'codex',
  };

export function readFirstRunProjectSetupDraft():
  | FirstRunProjectSetupDraft
  | undefined {
  const storedValue = readStoredValue();

  if (!storedValue) {
    return undefined;
  }

  try {
    return normalizeFirstRunProjectSetupDraft(JSON.parse(storedValue));
  } catch {
    return undefined;
  }
}

export function writeFirstRunProjectSetupDraft(
  draft: FirstRunProjectSetupDraft
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      firstRunProjectSetupDraftStorageKey,
      JSON.stringify({
        ...normalizeFirstRunProjectSetupDraft(draft),
        version: firstRunProjectSetupDraftVersion,
      })
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function clearFirstRunProjectSetupDraft() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(firstRunProjectSetupDraftStorageKey);
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function updateFirstRunProjectSetupDraft(
  patch: Partial<FirstRunProjectSetupDraft>
) {
  const current = readFirstRunProjectSetupDraft();
  const projectPath = patch.projectPath ?? current?.projectPath;

  if (!projectPath) {
    return;
  }

  writeFirstRunProjectSetupDraft({
    ...defaultFirstRunProjectSetupSelection,
    ...current,
    ...patch,
    projectPath,
  });
}

function readStoredValue() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage.getItem(firstRunProjectSetupDraftStorageKey);
  } catch {
    return undefined;
  }
}

function normalizeFirstRunProjectSetupDraft(
  draft: unknown
): FirstRunProjectSetupDraft | undefined {
  if (!draft || typeof draft !== 'object') {
    return undefined;
  }

  const value = draft as StoredFirstRunProjectSetupDraft;
  const projectPath =
    typeof value.projectPath === 'string' ? value.projectPath.trim() : '';

  if (!projectPath) {
    return undefined;
  }

  return {
    orchestratorHarnessId: normalizeAgentHarnessId(
      value.orchestratorHarnessId,
      defaultFirstRunProjectSetupSelection.orchestratorHarnessId
    ),
    projectPath,
    rememberOrchestratorDefault:
      typeof value.rememberOrchestratorDefault === 'boolean'
        ? value.rememberOrchestratorDefault
        : defaultFirstRunProjectSetupSelection.rememberOrchestratorDefault,
    rememberWorkerDefault:
      typeof value.rememberWorkerDefault === 'boolean'
        ? value.rememberWorkerDefault
        : defaultFirstRunProjectSetupSelection.rememberWorkerDefault,
    workerHarnessId: normalizeAgentHarnessId(
      value.workerHarnessId,
      defaultFirstRunProjectSetupSelection.workerHarnessId
    ),
  };
}

function normalizeAgentHarnessId(
  value: unknown,
  fallback: AgentHarnessId
): AgentHarnessId {
  return agentHarnessIds.includes(value as AgentHarnessId)
    ? (value as AgentHarnessId)
    : fallback;
}
