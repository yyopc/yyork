import { z } from 'zod';

import {
  getElapsedLabel,
  type ParsedToolCall,
  type SessionActivity,
  toKanbanCardView,
  type WorkerSessionRecord,
} from '@/features/home/domain/kanban-card-model';
import {
  type ProjectOrchestrator,
  type SessionWorkspace,
  sessionWorkspaceSchema as generatedSessionWorkspaceSchema,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
  type WorkerWorkspaceMode,
  workerWorkspaceModes,
  workerWorkspaceModeSchema,
} from '@/features/home/domain/session-workspace-contract.generated';
import {
  compareWorkerResponseAttention,
  type SeenWorkerSessionResponses,
  type WorkerResponseAttention,
} from '@/features/home/domain/worker-response-attention';

export {
  type ParsedToolCall,
  type SessionActivity,
  sessionActivityStates,
  type WorkerSessionRecord,
} from '@/features/home/domain/kanban-card-model';
export {
  type ProjectOrchestrator,
  type SessionWorkspace,
  type TerminalSessionKind,
  type WorkerAgent,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
  type WorkerWorkspaceMode,
  workerWorkspaceModes,
  workerWorkspaceModeSchema,
} from '@/features/home/domain/session-workspace-contract.generated';

export const sessionWorkspaceSchema = z.preprocess(
  normalizeLegacyWorkspaceProjectPaths,
  generatedSessionWorkspaceSchema
);

export interface KanbanCardData {
  activeToolCall?: ParsedToolCall;
  /** Formatted working-tool label for slot-text bulletin rendering. */
  activeToolCallLabel?: string;
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
  state: WorkerSessionState;
  responseAttention?: WorkerResponseAttention;
  recap: string;
  recapPreview: string;
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
   * of truth: a user-set displayName wins, then the hook-derived title, then a
   * generic worker fallback while hook metadata is pending. The raw prompt is
   * never shown as the navigation label.
   */
  label: string;
  project: string;
  selected?: boolean;
  selectionKey: string;
  state: WorkerSessionState;
  responseAttention?: WorkerResponseAttention;
  terminalSupported?: boolean;
  titlePending: boolean;
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

function normalizeLegacyWorkspaceProjectPaths(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.projects)) {
    return value;
  }

  return {
    ...value,
    projects: value.projects.map((project) => {
      if (
        !isRecord(project) ||
        typeof project.path === 'string' ||
        typeof project.cwd !== 'string'
      ) {
        return project;
      }

      return {
        ...project,
        path: project.cwd,
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getActiveProject(workspace: SessionWorkspace) {
  return (
    getProjectByIdOrPath(workspace.projects, workspace.activeProjectId) ??
    workspace.projects[0]
  );
}

export function getProjectByIdOrPath(
  projects: ProjectOrchestrator[],
  projectIdOrPath: string | undefined
) {
  if (!projectIdOrPath) {
    return undefined;
  }
  return projects.find(
    (project) =>
      project.id === projectIdOrPath ||
      project.path === projectIdOrPath ||
      project.cwd === projectIdOrPath
  );
}

export function getProjectPath(project: ProjectOrchestrator | undefined) {
  return project?.path ?? project?.cwd;
}

export function toKanbanCard(
  session: WorkerSessionRecord,
  seenResponses?: SeenWorkerSessionResponses
): KanbanCardData {
  return toKanbanCardView(session, seenResponses);
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
 * Resolves the sidebar label for a worker session. The backend normally sends
 * the resolved title, but this defends local/demo data without leaking the raw
 * launch prompt into compact navigation rows.
 */
export function getWorkerSessionNavLabel(
  session: Pick<WorkerSession, 'kind' | 'title'>
) {
  const title = session.title.trim();
  if (title) {
    return title;
  }
  return session.kind === 'orchestrator' ? 'Orchestrator' : 'New worker agent';
}

export function isWorkerSessionTitlePending(
  session: Pick<WorkerSession, 'kind' | 'metadata'>
) {
  if (session.kind === 'orchestrator') {
    return false;
  }

  const metadata = parseWorkerSessionMetadata(session.metadata);
  return (
    !readMetadataString(metadata, 'displayName') &&
    !readMetadataString(metadata, 'title')
  );
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
  sessions: WorkerSession[],
  seenResponses?: SeenWorkerSessionResponses
): KanbanColumnData[] {
  const columnsByState = createKanbanColumnsByState();

  for (const session of sessions) {
    columnsByState[session.state].cards.push(
      toKanbanCard(session, seenResponses)
    );
  }

  columnsByState.prompt.cards = sortPromptCards(columnsByState.prompt.cards);

  return workerSessionStates.map((state) => columnsByState[state]);
}

export function getKanbanColumn(
  sessions: WorkerSession[],
  state: WorkerSessionState,
  seenResponses?: SeenWorkerSessionResponses
): KanbanColumnData {
  const cards: KanbanCardData[] = [];

  for (const session of sessions) {
    if (session.state === state) {
      cards.push(toKanbanCard(session, seenResponses));
    }
  }

  return {
    id: state,
    title: workerSessionStateLabels[state],
    cards: state === 'prompt' ? sortPromptCards(cards) : cards,
  };
}

export function getWorkerSessionGroups(
  sessions: WorkerSession[],
  seenResponses?: SeenWorkerSessionResponses
): WorkerSessionGroupData[] {
  const groupsByState = createWorkerSessionGroupsByState();

  for (const session of sessions) {
    const selectionKey = getWorkerSessionSelectionKey(session);
    const card = toKanbanCard(session, seenResponses);
    groupsByState[session.state].sessions.push({
      agent: session.agent,
      elapsedLabel: getElapsedLabel(session),
      id: session.id,
      kind: session.kind,
      label: getWorkerSessionNavLabel(session),
      project: session.project,
      selected: session.selected,
      selectionKey,
      state: session.state,
      responseAttention: card.responseAttention,
      terminalSupported: session.terminalSupported,
      titlePending: isWorkerSessionTitlePending(session),
      workerId: session.workerId,
    });
  }

  groupsByState.prompt.sessions = sortPromptSessions(
    groupsByState.prompt.sessions
  );

  return workerSessionStates.map((state) => groupsByState[state]);
}

function sortPromptCards(cards: KanbanCardData[]) {
  return cards
    .map((card, index) => ({ card, index }))
    .sort(
      (a, b) =>
        compareWorkerResponseAttention(
          a.card.responseAttention,
          b.card.responseAttention
        ) || a.index - b.index
    )
    .map(({ card }) => card);
}

function sortPromptSessions(sessions: WorkerSessionNavItem[]) {
  return sessions
    .map((session, index) => ({ index, session }))
    .sort(
      (a, b) =>
        compareWorkerResponseAttention(
          a.session.responseAttention,
          b.session.responseAttention
        ) || a.index - b.index
    )
    .map(({ session }) => session);
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

function parseWorkerSessionMetadata(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}
