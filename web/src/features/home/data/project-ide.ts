import { mutationOptions } from '@tanstack/react-query';
import { z } from 'zod';

import type { ProjectOrchestrator } from '@/features/home/domain/session-workspace';

export type OpenProjectIdeInput = Pick<ProjectOrchestrator, 'id'>;

export interface OpenProjectIdeResult {
  cwd: string;
}

const openProjectIdeResultSchema = z.object({
  cwd: z.string(),
});

export function openProjectIdeMutationOptions() {
  return mutationOptions({
    mutationFn: openProjectIde,
  });
}

export function createOpenProjectIdePath(project: OpenProjectIdeInput) {
  return `/api/projects/${encodeURIComponent(project.id)}/ide`;
}

async function openProjectIde(
  project: OpenProjectIdeInput
): Promise<OpenProjectIdeResult> {
  const response = await fetch(createOpenProjectIdePath(project), {
    headers: {
      Accept: 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readOpenProjectIdeError(response));
  }

  return openProjectIdeResultSchema.parse(await response.json());
}

async function readOpenProjectIdeError(response: Response) {
  const message = (await response.text()).trim();
  if (message) {
    return message;
  }

  return `Failed to open project: ${response.status}`;
}
