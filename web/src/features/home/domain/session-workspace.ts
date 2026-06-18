import {
  getElapsedLabel,
  type SessionActivity,
  toKanbanCardView,
  type WorkerSessionRecord,
} from '@/features/home/domain/kanban-card-model';
import {
  type SessionWorkspace,
  sessionWorkspaceSchema,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
  type WorkerWorkspaceMode,
  workerWorkspaceModes,
  workerWorkspaceModeSchema,
} from '@/features/home/domain/session-workspace-contract.generated';

export {
  type SessionActivity,
  sessionActivityStates,
  type WorkerSessionRecord,
} from '@/features/home/domain/kanban-card-model';
export {
  type ProjectOrchestrator,
  type SessionWorkspace,
  sessionWorkspaceSchema,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
  type WorkerWorkspaceMode,
  workerWorkspaceModes,
  workerWorkspaceModeSchema,
} from '@/features/home/domain/session-workspace-contract.generated';

export interface KanbanCardData {
  activity: SessionActivity;
  activityLabel: string;
  agent: WorkerAgent;
  agentLabel: string;
  /** @deprecated Prefer `descriptionLines`. */
  currentLine: string;
  /** @deprecated Prefer `descriptionLines`. */
  description: string;
  descriptionLines: string[];
  id: string;
  issue: string;
  /** Raw metadata blob — not for direct display. */
  metadata: string;
  project: string;
  selected?: boolean;
  selectionKey: string;
  recap: string;
  shortId: string;
  task: string;
  /** @deprecated Prefer `task` — kept for transitional callers. */
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
  elapsedLabel: string;
  id: string;
  kind?: TerminalSessionKind;
  /**
   * Resolved display label for the session. The backend is the single source
   * of truth: a user-set displayName wins, then the hook-derived title, then
   * the raw prompt, then "new agent: <id>". The bare workerId is never shown.
   */
  label: string;
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

export interface TerminalRouteTarget {
  legacySelectionKey: boolean;
  project?: string;
  selectionKey?: string;
  sessionId: string;
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

export function toKanbanCard(session: WorkerSessionRecord): KanbanCardData {
  return toKanbanCardView(session);
}

export function getSelectedWorkerSession(sessions: WorkerSession[]) {
  return sessions.find((session) => session.selected);
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

export function getProjectIdFromSelectionKey(selectionKey: string) {
  const separatorIndex = selectionKey.indexOf(':');
  if (separatorIndex <= 0) {
    return undefined;
  }

  try {
    return decodeURIComponent(selectionKey.slice(0, separatorIndex));
  } catch {
    return undefined;
  }
}

export function getSessionIdFromSelectionKey(selectionKey: string) {
  const separatorIndex = selectionKey.indexOf(':');
  if (separatorIndex === -1 || separatorIndex === selectionKey.length - 1) {
    return undefined;
  }

  try {
    return decodeURIComponent(selectionKey.slice(separatorIndex + 1));
  } catch {
    return undefined;
  }
}

export function getTerminalRouteTarget(
  sessionId: string | undefined,
  project: string | undefined
): TerminalRouteTarget | undefined {
  if (!sessionId) {
    return undefined;
  }

  const legacyProject = getProjectIdFromSelectionKey(sessionId);
  const legacySessionId = getSessionIdFromSelectionKey(sessionId);
  if (legacyProject && legacySessionId) {
    return {
      legacySelectionKey: true,
      project: legacyProject,
      selectionKey: getWorkerSessionSelectionKey({
        id: legacySessionId,
        project: legacyProject,
      }),
      sessionId: legacySessionId,
    };
  }

  return {
    legacySelectionKey: false,
    project,
    selectionKey: project
      ? getWorkerSessionSelectionKey({ id: sessionId, project })
      : undefined,
    sessionId,
  };
}

/**
 * Resolves the sidebar label for a worker session. `title` is already derived
 * with full precedence (displayName > title > prompt > "new agent: <id>") in
 * toWorkerSession, so this just defends against an empty title by falling back
 * to the same id-based label the backend would produce.
 */
export function getWorkerSessionNavLabel(
  session: Pick<WorkerSession, 'id' | 'title'>
) {
  const title = session.title.trim();
  return title || `new agent: ${session.id}`;
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

export function getTerminalSessionForRoute(
  sessions: WorkerSession[],
  target: TerminalRouteTarget | undefined
) {
  if (!target) {
    return undefined;
  }

  if (target.project) {
    return sessions.find(
      (session) =>
        session.id === target.sessionId && session.project === target.project
    );
  }

  let matchedSession: WorkerSession | undefined;
  let matchCount = 0;
  for (const session of sessions) {
    if (session.id !== target.sessionId) {
      continue;
    }
    matchedSession = session;
    matchCount += 1;
  }

  return matchCount === 1 ? matchedSession : undefined;
}

export function terminalSessionIdRequiresProject(
  sessions: WorkerSession[],
  sessionId: string
) {
  let matchCount = 0;
  for (const session of sessions) {
    if (session.id !== sessionId) {
      continue;
    }
    matchCount += 1;
    if (matchCount > 1) {
      return true;
    }
  }

  return false;
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
      elapsedLabel: getElapsedLabel(session),
      id: session.id,
      kind: session.kind,
      label: getWorkerSessionNavLabel(session),
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
