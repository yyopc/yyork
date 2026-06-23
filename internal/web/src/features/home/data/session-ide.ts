import { mutationOptions } from '@tanstack/react-query';
import { z } from 'zod';

import type { WorkerSession } from '@/features/home/domain/session-workspace';

export type OpenSessionIdeInput = Pick<WorkerSession, 'id' | 'project'>;

export interface OpenSessionIdeResult {
  cwd: string;
}

const openSessionIdeResultSchema = z.object({
  cwd: z.string(),
});

export function openSessionIdeMutationOptions() {
  return mutationOptions({
    mutationFn: openSessionIde,
  });
}

export function createOpenSessionIdePath(session: OpenSessionIdeInput) {
  const params = new URLSearchParams({
    project: session.project,
  });

  return `/api/sessions/${encodeURIComponent(session.id)}/ide?${params}`;
}

async function openSessionIde(
  session: OpenSessionIdeInput
): Promise<OpenSessionIdeResult> {
  const response = await fetch(createOpenSessionIdePath(session), {
    headers: {
      Accept: 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readOpenSessionIdeError(response));
  }

  return openSessionIdeResultSchema.parse(await response.json());
}

async function readOpenSessionIdeError(response: Response) {
  const message = (await response.text()).trim();
  if (message) {
    return message;
  }

  return `Failed to open IDE: ${response.status}`;
}
