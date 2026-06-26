import type { WorkerSession } from '@/features/home/domain/session-workspace-contract.generated';

export type SeenWorkerSessionResponses = Record<string, string>;

export type WorkerResponseAttentionStatus = 'delivered' | 'seen';

export interface WorkerResponseAttention {
  deliveredAt: string;
  label: string;
  status: WorkerResponseAttentionStatus;
}

type AttentionSession = Pick<WorkerSession, 'metadata' | 'state'>;

export function getWorkerSessionResponseDeliveredAt(
  session: AttentionSession
): string | undefined {
  if (session.state !== 'prompt') {
    return undefined;
  }

  const metadata = parseWorkerSessionMetadata(session.metadata);
  const explicitDeliveredAt = readMetadataTimestampString(
    metadata,
    'lastAssistantMessageAt'
  );
  if (explicitDeliveredAt) {
    return explicitDeliveredAt;
  }

  return readMetadataTimestampString(metadata, 'lastActivityAt');
}

export function getWorkerSessionResponseAttention(
  session: AttentionSession,
  selectionKey: string,
  seenResponses: SeenWorkerSessionResponses | undefined
): WorkerResponseAttention | undefined {
  const deliveredAt = getWorkerSessionResponseDeliveredAt(session);
  const deliveredMs = parseTimestamp(deliveredAt);
  if (deliveredAt === undefined || deliveredMs === undefined) {
    return undefined;
  }

  const seenMs = parseTimestamp(seenResponses?.[selectionKey]);
  const status: WorkerResponseAttentionStatus =
    seenMs !== undefined && seenMs >= deliveredMs ? 'seen' : 'delivered';

  return {
    deliveredAt,
    label: status === 'seen' ? 'Response seen' : 'Response delivered',
    status,
  };
}

export function getSeenWorkerSessionResponsesUpdate(
  seenResponses: SeenWorkerSessionResponses | undefined,
  selectionKey: string,
  deliveredAt: string | undefined
): SeenWorkerSessionResponses | undefined {
  const deliveredMs = parseTimestamp(deliveredAt);
  if (!selectionKey || deliveredAt === undefined || deliveredMs === undefined) {
    return seenResponses;
  }

  const currentSeenAt = seenResponses?.[selectionKey];
  const currentSeenMs = parseTimestamp(currentSeenAt);
  if (currentSeenMs !== undefined && currentSeenMs >= deliveredMs) {
    return seenResponses;
  }

  return {
    ...seenResponses,
    [selectionKey]: deliveredAt,
  };
}

export function compareWorkerResponseAttention(
  a: WorkerResponseAttention | undefined,
  b: WorkerResponseAttention | undefined
) {
  const rankDiff = getAttentionRank(a) - getAttentionRank(b);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return getAttentionDeliveredMs(b) - getAttentionDeliveredMs(a);
}

function getAttentionRank(attention: WorkerResponseAttention | undefined) {
  if (attention?.status === 'delivered') {
    return 0;
  }
  if (attention?.status === 'seen') {
    return 1;
  }
  return 2;
}

function getAttentionDeliveredMs(
  attention: WorkerResponseAttention | undefined
) {
  return parseTimestamp(attention?.deliveredAt) ?? 0;
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

function readMetadataTimestampString(
  metadata: Record<string, unknown>,
  key: string
): string | undefined {
  const value = metadata[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const timestamp = value.trim();
  return parseTimestamp(timestamp) === undefined ? undefined : timestamp;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
