import {
  toKanbanCard,
  type WorkerSessionRecord,
} from '@/features/home/domain/session-workspace';

const liveWorkingSession = {
  agent: 'codex',
  createdAt: '2026-06-24T00:20:00.000Z',
  cwd: '/Users/tanishqpalandurkar/Projects/yyork',
  description:
    'Tracing agent hook registration across internal packages and CLI entrypoints.',
  id: 'session-yyork-hooks',
  issue: '',
  metadata: JSON.stringify({
    activity: 'working',
    currentToolCall: 'Running file read: internal/cli/hooks.go',
    lastActivityAt: '2026-06-24T00:31:12.000Z',
    prompt:
      'Explain the current state of agent hooks in yyork from the current codebase.',
    recap:
      'Tracing agent hook registration across internal packages and CLI entrypoints.',
    toolCallBulletins: [
      'Running shell command: rg "summarizeToolCall" internal/cli internal/plugin',
      'Running file read: internal/cli/hooks.go',
      'Reading file: internal/plugin/agent/claudecode/hooks.go',
      'Finished shell command: nl -ba internal/session/prompts/orchestrator.md',
    ],
    title:
      'Explain the current state of agent hooks in yyork from the current codebase',
  }),
  project: 'yyork',
  recap:
    'Tracing agent hook registration across internal packages and CLI entrypoints.',
  selected: true,
  state: 'working',
  terminalSupported: true,
  title:
    'Explain the current state of agent hooks in yyork from the current codebase',
  updatedAt: '2026-06-24T00:31:12.000Z',
  workerId: 'worker-sx8qdy',
} satisfies WorkerSessionRecord;

const claudeWorkingSession = {
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
    lastActivityAt: '2026-06-07T10:12:00.000Z',
    prompt:
      'Trace branch state and expose it consistently for dashboard state.',
    recap: 'Reading branch metadata files and wiring the dashboard projection.',
    toolCallBulletins: [
      'Running shell command: rg branch internal internal/web/src/features/home',
      'Running file read: internal/session/workspace_source.go',
      'Reading file: internal/web/src/features/home/domain/kanban-card-model.ts',
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

export const liveWorkingCard = toKanbanCard(liveWorkingSession);
export const claudeWorkingCard = toKanbanCard(claudeWorkingSession);
