import {
  getKanbanColumn,
  getKanbanColumns,
  getWorkerSessionGroups,
  type SessionWorkspace,
  toKanbanCard,
  type WorkerSession,
  type WorkerSessionRecord,
} from '@/features/home/domain/session-workspace';

const workingClaudeSession = {
  agent: 'claude-code',
  createdAt: '2026-06-07T10:00:00.000Z',
  cwd: '/Users/tanishqpalandurkar/Projects/yyork',
  description:
    'Reading branch metadata files and wiring the dashboard projection.',
  id: 'session-ao-1',
  issue: '[Issue #23]',
  metadata: JSON.stringify({
    activity: 'working',
    currentToolCall:
      'Running shell command: rg branch internal internal/web/src/features/home',
    prompt:
      'Trace branch state and expose it consistently for dashboard state.',
    recap: 'Reading branch metadata files and wiring the dashboard projection.',
    toolCallBulletins: [
      'Running shell command: rg branch internal internal/web/src/features/home',
      'Reading file: internal/session/workspace_source.go',
      'Finished file read: internal/web/src/features/home/domain/session-workspace.ts',
    ],
    title: 'Trace branch metadata',
  }),
  project: 'agent-orchestrator',
  recap: 'Reading branch metadata files and wiring the dashboard projection.',
  state: 'working',
  terminalSupported: true,
  title: 'Trace branch metadata',
  updatedAt: '2026-06-07T10:12:00.000Z',
  workerId: 'session-ao-1',
} satisfies WorkerSessionRecord;

const workingCodexSession = {
  ...workingClaudeSession,
  agent: 'codex',
  description: 'Scanning README and package manifests for an overview.',
  id: 'session-ao-2',
  metadata: JSON.stringify({
    activity: 'working',
    currentToolCall: 'Reading file: README.md',
    prompt: 'Tell me about this project',
    recap: 'Scanning README and package manifests for an overview.',
    toolCallBulletins: [
      'Reading file: README.md',
      'Finished shell command: pnpm --filter @yyork/web test:ci',
    ],
    title: 'Tell me about this project',
  }),
  selected: true,
  recap: 'Scanning README and package manifests for an overview.',
  title: 'Tell me about this project',
  workerId: 'session-ao-2',
} satisfies WorkerSessionRecord;

const orchestratorSession = {
  ...workingClaudeSession,
  description: 'Coordinates workers for the active project.',
  id: 'ao-orchestrator',
  issue: 'Orchestrator',
  kind: 'orchestrator',
  metadata: '[codex/working]',
  project: 'agent-orchestrator',
  recap: 'Coordinates workers for the active project.',
  title: 'Orchestrator',
  workerId: '[ORCHESTRATOR]',
} satisfies WorkerSession;

const promptCodexSession = {
  ...workingClaudeSession,
  agent: 'codex',
  description: 'Waiting for your answer on the split strategy.',
  id: 'session-ao-3',
  metadata: JSON.stringify({
    activity: 'waiting-for-input',
    prompt: 'Should we split the PR before landing?',
    recap: 'Waiting for your answer on the split strategy.',
    title: 'Split PR decision',
  }),
  state: 'prompt',
  recap: 'Waiting for your answer on the split strategy.',
  title: 'Split PR decision',
  workerId: 'session-ao-3',
} satisfies WorkerSessionRecord;

const promptClaudeSession = {
  ...workingClaudeSession,
  id: 'session-ao-4',
  state: 'prompt',
  workerId: '[AO-4]',
} satisfies WorkerSession;

const triageClaudeSession = {
  ...workingClaudeSession,
  id: 'session-ao-5',
  metadata: JSON.stringify({
    prompt: 'Review the generated migration plan',
    title: 'Review migration plan',
    triageReason:
      'Needs approval for shell command: git push origin yyork/card-state',
  }),
  recap: 'Prepared a migration plan and paused before pushing changes.',
  state: 'triage',
  title: 'Review migration plan',
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
    {
      id: 'firered-vad',
      name: 'FireRedVAD',
      path: '/Users/tanishqpalandurkar/Projects/FireRedVAD',
      workerWorkspaceMode: 'local',
    },
    {
      id: 'agent-orchestrator',
      name: 'Agent Orchestrator',
      path: '/Users/tanishqpalandurkar/Projects/agent-orchestrator',
      workerWorkspaceMode: 'local',
    },
    {
      id: 'ao-tui',
      name: 'AO TUI',
      path: '/Users/tanishqpalandurkar/Projects/ao-tui',
      workerWorkspaceMode: 'local',
    },
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
