import type {
  KanbanCardData,
  WorkerSession,
  WorkerSessionState,
} from '@/features/home/domain/session-workspace';

export const sessionActivityStates = [
  'working',
  'waiting-for-input',
  'idle',
  'error',
  'done',
] as const;

export type SessionActivity = (typeof sessionActivityStates)[number];

const sessionActivityLabels = {
  working: 'Working',
  'waiting-for-input': 'Waiting for you',
  idle: 'Idle',
  error: 'Error',
  done: 'Done',
} satisfies Record<SessionActivity, string>;

const agentLabels: Record<string, string> = {
  'claude-code': 'Claude Code',
  claude: 'Claude Code',
  codex: 'Codex',
};

export type WorkerSessionRecord = WorkerSession & {
  createdAt?: string;
  updatedAt?: string;
};

export function toKanbanCardView(session: WorkerSessionRecord): KanbanCardData {
  const metadata = parseSessionMetadata(session.metadata);
  const activity = resolveSessionActivity(metadata, session.state);
  const task = resolveTaskTitle(session, metadata);
  const recap = resolveRecap(session);
  const descriptionLines = resolveDescriptionLines(session, metadata, recap);
  const description = descriptionLines.join('\n');
  return {
    activity,
    activityLabel: sessionActivityLabels[activity],
    agent: session.agent,
    agentLabel: agentLabels[session.agent] ?? session.agent,
    /** @deprecated Prefer `descriptionLines`. */
    currentLine: description,
    description,
    descriptionLines,
    id: session.id,
    issue: session.issue,
    metadata: session.metadata,
    project: session.project,
    recap,
    selected: session.selected,
    selectionKey: `${encodeURIComponent(session.project)}:${encodeURIComponent(session.id)}`,
    shortId: formatShortSessionId(session.workerId || session.id),
    task,
    title: task,
    workerId: session.workerId,
  };
}

export function getElapsedLabel(session: WorkerSessionRecord): string {
  const metadata = parseSessionMetadata(session.metadata);
  return formatElapsed(resolveElapsedMs(session, metadata));
}

export function parseSessionMetadata(raw: string): Record<string, unknown> {
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

function resolveSessionActivity(
  metadata: Record<string, unknown>,
  columnState: WorkerSessionState
): SessionActivity {
  const activity = metadata.activity;
  if (
    typeof activity === 'string' &&
    sessionActivityStates.includes(activity as SessionActivity)
  ) {
    return activity as SessionActivity;
  }

  switch (columnState) {
    case 'prompt':
    case 'triage':
      return 'waiting-for-input';
    case 'done':
      return 'done';
    case 'working':
    default:
      return 'working';
  }
}

function resolveTaskTitle(
  session: WorkerSession,
  metadata: Record<string, unknown>
): string {
  const title = readMetadataString(metadata, 'title');
  if (title) {
    return title;
  }

  const prompt = readMetadataString(metadata, 'prompt');
  if (prompt) {
    return prompt;
  }

  if (session.title.trim()) {
    return session.title;
  }

  if (session.description.trim()) {
    return session.description;
  }

  return 'Untitled session';
}

function resolveRecap(session: WorkerSession): string {
  const recap = session.recap.trim();
  if (recap) {
    return recap;
  }

  return session.description.trim();
}

function resolveDescriptionLines(
  session: WorkerSession,
  metadata: Record<string, unknown>,
  recap: string
): string[] {
  switch (session.state) {
    case 'working':
      return resolveWorkingDescriptionLines(metadata, recap);
    case 'prompt':
      return [recap || 'Ready for your next prompt.'];
    case 'triage':
      return [
        readMetadataString(metadata, 'triageReason') ||
          recap ||
          'Needs triage before it can continue.',
      ];
    case 'done':
      return [
        readMetadataString(metadata, 'doneSummary') ||
          recap ||
          'Session finished.',
      ];
    default:
      return recap ? [recap] : [];
  }
}

function resolveWorkingDescriptionLines(
  metadata: Record<string, unknown>,
  recap: string
): string[] {
  const currentToolCall = readMetadataString(metadata, 'currentToolCall');
  const toolBulletins = readMetadataStringArray(metadata, 'toolCallBulletins');
  const toolLines = currentToolCall
    ? [
        currentToolCall,
        ...toolBulletins.filter((line) => line !== currentToolCall),
      ]
    : toolBulletins;

  if (toolLines.length > 0) {
    return limitDescriptionLines(toolLines);
  }

  const activityDetail = readMetadataString(metadata, 'activityDetail');
  if (activityDetail) {
    return [activityDetail];
  }

  return [recap || 'Working on assigned task.'];
}

function resolveElapsedMs(
  session: WorkerSessionRecord,
  metadata: Record<string, unknown>
): number {
  const lastActivityAt = readMetadataTimestamp(metadata, 'lastActivityAt');
  if (lastActivityAt !== undefined) {
    return Math.max(0, Date.now() - lastActivityAt);
  }

  const updatedAt = parseTimestamp(session.updatedAt);
  if (updatedAt !== undefined) {
    return Math.max(0, Date.now() - updatedAt);
  }

  const createdAt = parseTimestamp(session.createdAt);
  if (createdAt !== undefined) {
    return Math.max(0, Date.now() - createdAt);
  }

  return 0;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readMetadataStringArray(
  metadata: Record<string, unknown>,
  key: string
): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const line = item.trim();
    if (line && !seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return limitDescriptionLines(out);
}

function limitDescriptionLines(lines: string[]): string[] {
  return lines.slice(0, 3);
}

function readMetadataTimestamp(
  metadata: Record<string, unknown>,
  key: string
): number | undefined {
  const value = metadata[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  return parseTimestamp(value);
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function formatElapsed(elapsedMs: number): string {
  if (elapsedMs <= 0) {
    return 'now';
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) {
    return 'now';
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours}h`;
  }

  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 7) {
    return `${totalDays}d`;
  }

  if (totalDays < 30) {
    return `${Math.floor(totalDays / 7)}w`;
  }

  if (totalDays < 365) {
    return `${Math.floor(totalDays / 30)}mo`;
  }

  return `${Math.floor(totalDays / 365)}y`;
}

function formatShortSessionId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }

  return trimmed.slice(-6);
}
