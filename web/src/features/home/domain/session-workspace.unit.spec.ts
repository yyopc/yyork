import { describe, expect, it } from 'vitest';

import {
  getActiveProject,
  getKanbanColumns,
  getTerminalSession,
  getWorkerSessionGroups,
  getWorkerSessionNavLabel,
  getWorkerSessionSelectionKey,
  type SessionWorkspace,
  withSelectedWorkerSession,
  type WorkerSession,
} from '@/features/home/domain/session-workspace';

const workspace = {
  activeProjectId: 'agent-orchestrator',
  projects: [
    { id: 'firered-vad', name: 'FireRedVAD' },
    { id: 'agent-orchestrator', name: 'Agent Orchestrator' },
  ],
  sessions: [
    {
      agent: 'codex',
      description: 'Fix pending review feedback.',
      id: 'session-ao-1',
      issue: '[Issue #23]',
      metadata: '[codex/metadata]',
      project: 'agent-orchestrator',
      recap: 'Fix pending review feedback.',
      selected: true,
      state: 'working',
      title: 'Address review feedback',
      workerId: '[AO-1]',
    },
    {
      agent: 'claude',
      description: 'Waiting for a maintainer decision.',
      id: 'session-ao-2',
      issue: '[Issue #24]',
      metadata: '[claude/metadata]',
      project: 'agent-orchestrator',
      recap: 'Waiting for a maintainer decision.',
      state: 'triage',
      title: 'Clarify release gate',
      workerId: '[AO-2]',
    },
  ],
} satisfies SessionWorkspace;

describe('session workspace projection', () => {
  it('resolves the active project from the workspace', () => {
    expect(getActiveProject(workspace)).toEqual({
      id: 'agent-orchestrator',
      name: 'Agent Orchestrator',
    });
  });

  it('projects worker sessions into ordered Kanban columns', () => {
    expect(getKanbanColumns(workspace.sessions)).toMatchObject([
      {
        id: 'working',
        title: 'Working',
        cards: [
          {
            id: 'session-ao-1',
            agent: 'codex',
            selected: true,
            workerId: '[AO-1]',
          },
        ],
      },
      { id: 'prompt', title: 'Prompt', cards: [] },
      {
        id: 'triage',
        title: 'Triage',
        cards: [{ id: 'session-ao-2', agent: 'claude', workerId: '[AO-2]' }],
      },
      { id: 'done', title: 'Done', cards: [] },
    ]);
  });

  it('projects worker sessions into sidebar groups', () => {
    expect(getWorkerSessionGroups(workspace.sessions)).toEqual([
      {
        id: 'working',
        label: 'Working',
        sessions: [
          {
            agent: 'codex',
            elapsedLabel: 'now',
            id: 'session-ao-1',
            kind: undefined,
            label: 'Address review feedback',
            project: 'agent-orchestrator',
            selected: true,
            selectionKey: 'agent-orchestrator:session-ao-1',
            workerId: '[AO-1]',
          },
        ],
      },
      { id: 'prompt', label: 'Prompt', sessions: [] },
      {
        id: 'triage',
        label: 'Triage',
        sessions: [
          {
            agent: 'claude',
            elapsedLabel: 'now',
            id: 'session-ao-2',
            kind: undefined,
            label: 'Clarify release gate',
            project: 'agent-orchestrator',
            selected: undefined,
            selectionKey: 'agent-orchestrator:session-ao-2',
            workerId: '[AO-2]',
          },
        ],
      },
      { id: 'done', label: 'Done', sessions: [] },
    ]);
  });

  it('uses the resolved title as the sidebar nav label', () => {
    expect(
      getWorkerSessionNavLabel({ id: 'v042rv', title: 'Address review feedback' })
    ).toBe('Address review feedback');
  });

  it('falls back to "new agent: <id>" when the title is empty', () => {
    expect(getWorkerSessionNavLabel({ id: 'v042rv', title: '   ' })).toBe(
      'new agent: v042rv'
    );
  });

  it('selects duplicate worker ids by project-qualified key', () => {
    const duplicateIdWorkspace = {
      ...workspace,
      sessions: [
        {
          ...workspace.sessions[0]!,
          id: 'ao-1',
          project: 'project-a',
          selected: true,
          title: 'Project A worker',
        },
        {
          ...workspace.sessions[1]!,
          id: 'ao-1',
          project: 'project-b',
          selected: undefined,
          title: 'Project B worker',
        },
      ],
    } satisfies SessionWorkspace;

    const projectBKey = getWorkerSessionSelectionKey({
      id: 'ao-1',
      project: 'project-b',
    });
    const selectedSessions = withSelectedWorkerSession(
      duplicateIdWorkspace.sessions,
      projectBKey
    );

    expect(selectedSessions).toMatchObject([
      { id: 'ao-1', project: 'project-a', selected: false },
      { id: 'ao-1', project: 'project-b', selected: true },
    ]);
  });

  it('selects any terminal session by project-qualified key', () => {
    const orchestrator = {
      ...workspace.sessions[0]!,
      id: 'ao-orchestrator',
      kind: 'orchestrator',
      title: 'Project orchestrator',
      workerId: '[ORCHESTRATOR]',
    } satisfies WorkerSession;

    const selectionKey = getWorkerSessionSelectionKey(orchestrator);

    expect(
      getTerminalSession([orchestrator, ...workspace.sessions], selectionKey)
    ).toMatchObject({
      id: 'ao-orchestrator',
      kind: 'orchestrator',
    });
  });
});
