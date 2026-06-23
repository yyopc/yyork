import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

const canvasGitStatusSchema = z.enum([
  'added',
  'deleted',
  'modified',
  'renamed',
  'untracked',
]);

const canvasDiffResponseSchema = z.object({
  baseLabel: z.string(),
  cwd: z.string(),
  files: z.array(
    z.object({
      additions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
      path: z.string(),
      status: canvasGitStatusSchema,
    })
  ),
  generatedAt: z.string(),
  patch: z.string(),
  patchTruncated: z.boolean().optional().default(false),
  target: z.object({
    kind: z.literal('session'),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
});

export type CanvasDiffSnapshot = z.infer<typeof canvasDiffResponseSchema>;

export function sessionCanvasDiffQueryOptions(input: {
  enabled: boolean;
  projectId?: string;
  sessionId?: string;
}) {
  return queryOptions({
    enabled:
      input.enabled &&
      typeof window !== 'undefined' &&
      Boolean(input.sessionId),
    queryFn: () =>
      fetchSessionCanvasDiff({
        projectId: input.projectId,
        sessionId: input.sessionId,
      }),
    queryKey: [
      'session-canvas-diff',
      input.projectId ?? '',
      input.sessionId ?? '',
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 2000,
  });
}

async function fetchSessionCanvasDiff(input: {
  projectId?: string;
  sessionId?: string;
}): Promise<CanvasDiffSnapshot> {
  if (!input.sessionId) {
    throw new Error('Cannot load a diff without a selected session.');
  }

  const params = new URLSearchParams();
  if (input.projectId) {
    params.set('project', input.projectId);
  }

  const queryString = params.toString();
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(input.sessionId)}/canvas/diff${
      queryString ? `?${queryString}` : ''
    }`,
    {
      headers: { Accept: 'application/json' },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to load diff: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Failed to load diff: expected JSON, got ${contentType || 'unknown content type'}`
    );
  }

  return canvasDiffResponseSchema.parse(await response.json());
}
