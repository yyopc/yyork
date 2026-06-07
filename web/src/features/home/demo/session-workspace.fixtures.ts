import {
  getKanbanColumn,
  getKanbanColumns,
  getWorkerSessionGroups,
  type SessionWorkspace,
  toKanbanCard,
  type WorkerSession,
} from '@/features/home/domain/session-workspace';

const workingClaudeSession = {
  // The backend emits the agent plugin id verbatim; the claude plugin id is
  // "claude-code" (see internal/plugin/agent/claudecode). Use it here so the
  // demo/storybook fixtures match what the running app actually sends.
  agent: 'claude-code',
  cwd: '/Users/tanishqpalandurkar/Projects/yyork',
  description:
    'Trace branch state and expose it consistently for dashboard state.',
  id: 'session-ao-1',
  issue: '[Issue #23]',
  metadata: '[claude/metadata]',
  project: 'agent-orchestrator',
  state: 'working',
  terminalSupported: true,
  title: 'Trace branch metadata',
  workerId: '[AO-1]',
} satisfies WorkerSession;

const workingCodexSession = {
  ...workingClaudeSession,
  agent: 'codex',
  id: 'session-ao-2',
  metadata: '[codex/metadata]',
  selected: true,
  workerId: '[AO-2]',
} satisfies WorkerSession;

const orchestratorSession = {
  ...workingClaudeSession,
  description: 'Coordinates workers for the active project.',
  id: 'ao-orchestrator',
  issue: 'Orchestrator',
  kind: 'orchestrator',
  metadata: '[codex/working]',
  project: 'agent-orchestrator',
  title: 'Project orchestrator',
  workerId: '[ORCHESTRATOR]',
} satisfies WorkerSession;

const promptCodexSession = {
  ...workingClaudeSession,
  agent: 'codex',
  id: 'session-ao-3',
  metadata: '[codex/metadata]',
  state: 'prompt',
  workerId: '[AO-3]',
} satisfies WorkerSession;

const promptClaudeSession = {
  ...workingClaudeSession,
  id: 'session-ao-4',
  state: 'prompt',
  workerId: '[AO-4]',
} satisfies WorkerSession;

const triageClaudeSession = {
  ...workingClaudeSession,
  id: 'session-ao-5',
  state: 'triage',
  workerId: '[AO-5]',
} satisfies WorkerSession;

const triageCodexSessionA = {
  ...workingClaudeSession,
  agent: 'codex',
  id: 'session-ao-6',
  metadata: '[codex/metadata]',
  state: 'triage',
  workerId: '[AO-6]',
} satisfies WorkerSession;

const triageCodexSessionB = {
  ...triageCodexSessionA,
  id: 'session-ao-7',
  workerId: '[AO-7]',
} satisfies WorkerSession;

const triageCodexSessionC = {
  ...triageCodexSessionA,
  id: 'session-ao-8',
  workerId: '[AO-8]',
} satisfies WorkerSession;

export const demoHomeWorkspace = {
  activeProjectId: 'agent-orchestrator',
  orchestrators: [orchestratorSession],
  projects: [
    { id: 'firered-vad', name: 'FireRedVAD' },
    { id: 'agent-orchestrator', name: 'Agent Orchestrator' },
    { id: 'ao-tui', name: 'AO TUI' },
  ],
  sessions: [
    workingClaudeSession,
    workingCodexSession,
    promptCodexSession,
    promptClaudeSession,
    triageClaudeSession,
    triageCodexSessionA,
    triageCodexSessionB,
    triageCodexSessionC,
  ],
} satisfies SessionWorkspace;

export const sampleKanbanCards = {
  claude: toKanbanCard(workingClaudeSession),
  codex: toKanbanCard(promptCodexSession),
  selectedCodex: toKanbanCard(workingCodexSession),
};

export const sampleKanbanColumns = getKanbanColumns(demoHomeWorkspace.sessions);
export const emptyKanbanColumns = getKanbanColumns([]);

export const workingKanbanColumn = getKanbanColumn(
  demoHomeWorkspace.sessions,
  'working'
);
export const promptKanbanColumn = getKanbanColumn(
  demoHomeWorkspace.sessions,
  'prompt'
);
export const triageKanbanColumn = getKanbanColumn(
  demoHomeWorkspace.sessions,
  'triage'
);
export const doneKanbanColumn = getKanbanColumn(
  demoHomeWorkspace.sessions,
  'done'
);

export const sampleWorkerSessionGroups = getWorkerSessionGroups(
  demoHomeWorkspace.sessions
);
