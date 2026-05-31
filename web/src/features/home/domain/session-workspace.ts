import {
  type ProjectOrchestrator,
  type SessionWorkspace,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
} from '@/features/home/domain/session-workspace-contract.generated';

export {
  type ProjectOrchestrator,
  type SessionWorkspace,
  sessionWorkspaceSchema,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
} from '@/features/home/domain/session-workspace-contract.generated';

export interface KanbanCardData {
  agent: WorkerAgent;
  description: string;
  id: string;
  issue: string;
  metadata: string;
  project: string;
  selected?: boolean;
  selectionKey: string;
  title: string;
  workerId: string;
}

export interface KanbanColumnData {
  cards: KanbanCardData[];
  id: WorkerSessionState;
  title: string;
}

export interface WorkerSessionNavItem {
  agent: WorkerAgent;
  id: string;
  kind?: TerminalSessionKind;
  project: string;
  selected?: boolean;
  selectionKey: string;
  terminalSupported?: boolean;
  workerId: string;
}

export interface WorkerSessionGroupData {
  id: WorkerSessionState;
  label: string;
  sessions: WorkerSessionNavItem[];
}

export const workerSessionStateLabels = {
  working: 'Working',
  prompt: 'Prompt',
  triage: 'Triage',
  done: 'Done',
} satisfies Record<WorkerSessionState, string>;

export function getActiveProject(workspace: SessionWorkspace) {
  return (
    workspace.projects.find(
      (project) => project.id === workspace.activeProjectId
    ) ?? workspace.projects[0]
  );
}

export function toKanbanCard(session: WorkerSession): KanbanCardData {
  return {
    agent: session.agent,
    description: session.description,
    id: session.id,
    issue: session.issue,
    metadata: session.metadata,
    project: session.project,
    selected: session.selected,
    selectionKey: getWorkerSessionSelectionKey(session),
    title: session.title,
    workerId: session.workerId,
  };
}

export function getSelectedWorkerSession(sessions: WorkerSession[]) {
  return sessions.find((session) => session.selected) ?? sessions[0];
}

export function withSelectedWorkerSession(
  sessions: WorkerSession[],
  selectedSessionKey: string | undefined
) {
  const fallbackSession = getSelectedWorkerSession(sessions);
  const nextSelectedSessionKey = sessions.some(
    (session) => getWorkerSessionSelectionKey(session) === selectedSessionKey
  )
    ? selectedSessionKey
    : fallbackSession
      ? getWorkerSessionSelectionKey(fallbackSession)
      : undefined;

  return sessions.map((session) => ({
    ...session,
    selected: getWorkerSessionSelectionKey(session) === nextSelectedSessionKey,
  }));
}

export function getWorkerSessionSelectionKey(
  session: Pick<WorkerSession, 'id' | 'project'>
) {
  return `${encodeURIComponent(session.project)}:${encodeURIComponent(session.id)}`;
}

export function getTerminalSession(
  sessions: WorkerSession[],
  selectionKey: string | undefined
) {
  if (!selectionKey) {
    return undefined;
  }

  return sessions.find(
    (session) => getWorkerSessionSelectionKey(session) === selectionKey
  );
}

export function getKanbanColumns(
  sessions: WorkerSession[]
): KanbanColumnData[] {
  const columnsByState = createKanbanColumnsByState();

  for (const session of sessions) {
    columnsByState[session.state].cards.push(toKanbanCard(session));
  }

  return workerSessionStates.map((state) => columnsByState[state]);
}

export function getKanbanColumn(
  sessions: WorkerSession[],
  state: WorkerSessionState
): KanbanColumnData {
  const cards: KanbanCardData[] = [];

  for (const session of sessions) {
    if (session.state === state) {
      cards.push(toKanbanCard(session));
    }
  }

  return {
    id: state,
    title: workerSessionStateLabels[state],
    cards,
  };
}

export function getWorkerSessionGroups(
  sessions: WorkerSession[]
): WorkerSessionGroupData[] {
  const groupsByState = createWorkerSessionGroupsByState();

  for (const session of sessions) {
    groupsByState[session.state].sessions.push({
      agent: session.agent,
      id: session.id,
      kind: session.kind,
      project: session.project,
      selected: session.selected,
      selectionKey: getWorkerSessionSelectionKey(session),
      terminalSupported: session.terminalSupported,
      workerId: session.workerId,
    });
  }

  return workerSessionStates.map((state) => groupsByState[state]);
}

function createKanbanColumnsByState() {
  const columnsByState = {} as Record<WorkerSessionState, KanbanColumnData>;

  for (const state of workerSessionStates) {
    columnsByState[state] = {
      id: state,
      title: workerSessionStateLabels[state],
      cards: [],
    };
  }

  return columnsByState;
}

function createWorkerSessionGroupsByState() {
  const groupsByState = {} as Record<
    WorkerSessionState,
    WorkerSessionGroupData
  >;

  for (const state of workerSessionStates) {
    groupsByState[state] = {
      id: state,
      label: workerSessionStateLabels[state],
      sessions: [],
    };
  }

  return groupsByState;
}
