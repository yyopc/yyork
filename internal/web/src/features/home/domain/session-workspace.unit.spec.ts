import { describe, expect, it } from 'vitest';

import {
  getActiveProject,
  getKanbanColumns,
  getProjectByIdOrPath,
  getProjectIdFromSelectionKey,
  getProjectPath,
  getSessionIdFromSelectionKey,
  getTerminalRouteTarget,
  getTerminalSession,
  getTerminalSessionForRoute,
  getWorkerSessionGroups,
  getWorkerSessionNavLabel,
  getWorkerSessionSelectionKey,
  type SessionWorkspace,
  terminalSessionIdRequiresProject,
  withSelectedWorkerSession,
  type WorkerSession,
} from '@/features/home/domain/session-workspace';

const workspace = {
  activeProjectId: 'agent-orchestrator',
  projects: [
    {
      id: 'firered-vad',
      name: 'FireRedVAD',
      path: '/Users/example/FireRedVAD',
      workerWorkspaceMode: 'local',
    },
    {
      id: 'agent-orchestrator',
      name: 'Agent Orchestrator',
      path: '/Users/example/agent-orchestrator',
      workerWorkspaceMode: 'local',
    },
  ],
  sessions: [
    {
      agent: 'codex',
      description: 'Fix pending review feedback.',
      id: 'session-ao-1',
      issue: '[Issue #23]',
      metadata: JSON.stringify({ title: 'Address review feedback' }),
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
      metadata: JSON.stringify({ title: 'Clarify release gate' }),
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
      path: '/Users/example/agent-orchestrator',
      workerWorkspaceMode: 'local',
    });
  });

  it('resolves projects by opaque id or legacy path', () => {
    expect(getProjectByIdOrPath(workspace.projects, 'agent-orchestrator')).toBe(
      workspace.projects[1]
    );
    expect(
      getProjectByIdOrPath(
        workspace.projects,
        '/Users/example/agent-orchestrator'
      )
    ).toBe(workspace.projects[1]);
    expect(getProjectPath(workspace.projects[1])).toBe(
      '/Users/example/agent-orchestrator'
    );
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

  it('sorts unread prompt cards before seen prompt cards by delivered recency', () => {
    const promptSessions = [
      promptSession('seen-older', '2026-06-07T10:05:00.000Z'),
      promptSession('unread-older', '2026-06-07T10:10:00.000Z'),
      promptSession('unread-newer', '2026-06-07T10:15:00.000Z'),
    ];

    expect(
      getKanbanColumns(promptSessions, {
        'agent-orchestrator:seen-older': '2026-06-07T10:05:00.000Z',
      })[1]!.cards.map((card) => card.id)
    ).toEqual(['unread-newer', 'unread-older', 'seen-older']);
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
            responseAttention: undefined,
            selected: true,
            selectionKey: 'agent-orchestrator:session-ao-1',
            state: 'working',
            terminalSupported: undefined,
            titlePending: false,
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
            responseAttention: undefined,
            selected: undefined,
            selectionKey: 'agent-orchestrator:session-ao-2',
            state: 'triage',
            terminalSupported: undefined,
            titlePending: false,
            workerId: '[AO-2]',
          },
        ],
      },
      { id: 'done', label: 'Done', sessions: [] },
    ]);
  });

  it('sorts unread prompt sidebar sessions before seen prompt sessions', () => {
    const promptSessions = [
      promptSession('seen-older', '2026-06-07T10:05:00.000Z'),
      promptSession('unread-older', '2026-06-07T10:10:00.000Z'),
      promptSession('unread-newer', '2026-06-07T10:15:00.000Z'),
    ];

    expect(
      getWorkerSessionGroups(promptSessions, {
        'agent-orchestrator:seen-older': '2026-06-07T10:05:00.000Z',
      })[1]!.sessions.map((session) => ({
        id: session.id,
        status: session.responseAttention?.status,
      }))
    ).toEqual([
      { id: 'unread-newer', status: 'delivered' },
      { id: 'unread-older', status: 'delivered' },
      { id: 'seen-older', status: 'seen' },
    ]);
  });

  it('uses the resolved title as the sidebar nav label', () => {
    expect(
      getWorkerSessionNavLabel({
        kind: undefined,
        title: 'Address review feedback',
      })
    ).toBe('Address review feedback');
  });

  it('falls back to "New worker agent" when the title is empty', () => {
    expect(getWorkerSessionNavLabel({ kind: undefined, title: '   ' })).toBe(
      'New worker agent'
    );
  });

  it('marks worker titles as pending until hook metadata is available', () => {
    expect(
      getWorkerSessionGroups([
        {
          ...workspace.sessions[0]!,
          metadata: JSON.stringify({
            prompt: 'Do not render this as a label.',
          }),
          title: 'New worker agent',
        },
      ])[0]!.sessions[0]
    ).toMatchObject({
      label: 'New worker agent',
      titlePending: true,
    });
  });

  it('clears the pending title state when hook title metadata exists', () => {
    expect(
      getWorkerSessionGroups([
        {
          ...workspace.sessions[0]!,
          metadata: JSON.stringify({
            prompt: 'Stored launch prompt.',
            title: 'Fix auth redirect',
          }),
          title: 'Fix auth redirect',
        },
      ])[0]!.sessions[0]
    ).toMatchObject({
      label: 'Fix auth redirect',
      titlePending: false,
    });
  });

  it('clears the pending title state when displayName metadata exists', () => {
    expect(
      getWorkerSessionGroups([
        {
          ...workspace.sessions[0]!,
          metadata: JSON.stringify({
            displayName: 'Renamed worker',
            prompt: 'Stored launch prompt.',
          }),
          title: 'Renamed worker',
        },
      ])[0]!.sessions[0]
    ).toMatchObject({
      label: 'Renamed worker',
      titlePending: false,
    });
  });

  it('falls back to "Orchestrator" for empty orchestrator titles', () => {
    expect(
      getWorkerSessionNavLabel({ kind: 'orchestrator', title: '   ' })
    ).toBe('Orchestrator');
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
      title: 'Orchestrator',
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

  it('parses project-qualified selection keys', () => {
    const selectionKey = getWorkerSessionSelectionKey({
      id: 'ao-1',
      project: '/Users/example/projects/yyork',
    });

    expect(getProjectIdFromSelectionKey(selectionKey)).toBe(
      '/Users/example/projects/yyork'
    );
    expect(getSessionIdFromSelectionKey(selectionKey)).toBe('ao-1');
  });

  it('builds a pretty terminal route target from session id plus project search', () => {
    expect(getTerminalRouteTarget('ao-1', 'project-b')).toEqual({
      legacySelectionKey: false,
      project: 'project-b',
      selectionKey: 'project-b:ao-1',
      sessionId: 'ao-1',
    });
  });

  it('keeps legacy project-qualified terminal route params readable', () => {
    const legacyKey = getWorkerSessionSelectionKey({
      id: 'ao-1',
      project: '/Users/example/projects/yyork',
    });

    expect(getTerminalRouteTarget(legacyKey, undefined)).toEqual({
      legacySelectionKey: true,
      project: '/Users/example/projects/yyork',
      selectionKey: legacyKey,
      sessionId: 'ao-1',
    });
  });

  it('resolves a unique terminal route target without project search', () => {
    expect(
      getTerminalSessionForRoute(
        workspace.sessions,
        getTerminalRouteTarget('session-ao-2', undefined)
      )
    ).toMatchObject({
      id: 'session-ao-2',
      project: 'agent-orchestrator',
    });
  });

  it('requires project search when terminal route session ids collide', () => {
    const sessions = [
      { ...workspace.sessions[0]!, id: 'ao-1', project: 'project-a' },
      { ...workspace.sessions[1]!, id: 'ao-1', project: 'project-b' },
    ];

    expect(terminalSessionIdRequiresProject(sessions, 'ao-1')).toBe(true);
    expect(
      getTerminalSessionForRoute(
        sessions,
        getTerminalRouteTarget('ao-1', undefined)
      )
    ).toBeUndefined();
    expect(
      getTerminalSessionForRoute(
        sessions,
        getTerminalRouteTarget('ao-1', 'project-b')
      )
    ).toMatchObject({
      id: 'ao-1',
      project: 'project-b',
    });
  });
});

function promptSession(id: string, deliveredAt: string): WorkerSession {
  return {
    ...workspace.sessions[0]!,
    id,
    metadata: JSON.stringify({
      lastAssistantMessageAt: deliveredAt,
      title: id,
    }),
    selected: undefined,
    state: 'prompt',
    title: id,
    workerId: id,
  };
}
