import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

const fileTreeGitStatusSchema = z.enum([
  'added',
  'deleted',
  'ignored',
  'modified',
  'renamed',
  'untracked',
]);

const sessionFilesResponseSchema = z.object({
  gitStatus: z
    .array(
      z.object({
        path: z.string(),
        status: fileTreeGitStatusSchema,
      })
    )
    .default([]),
  paths: z.array(z.string()),
  truncated: z.boolean().optional().default(false),
  workspacePath: z.string(),
});

const sessionFileContentResponseSchema = z.object({
  binary: z.boolean().optional().default(false),
  contents: z.string(),
  path: z.string(),
  size: z.number(),
  truncated: z.boolean().optional().default(false),
  workspacePath: z.string(),
});

export type SessionFiles = z.infer<typeof sessionFilesResponseSchema>;
export type SessionFileContent = z.infer<
  typeof sessionFileContentResponseSchema
>;

export function sessionFilesQueryOptions(input: {
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
      fetchSessionFiles({
        projectId: input.projectId,
        sessionId: input.sessionId,
      }),
    queryKey: ['session-files', input.projectId ?? '', input.sessionId ?? ''],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5000,
  });
}

export function sessionFileContentQueryOptions(input: {
  enabled: boolean;
  path?: string | null;
  projectId?: string;
  sessionId?: string;
}) {
  return queryOptions({
    enabled:
      input.enabled &&
      typeof window !== 'undefined' &&
      Boolean(input.sessionId) &&
      Boolean(input.path),
    queryFn: () =>
      fetchSessionFileContent({
        path: input.path,
        projectId: input.projectId,
        sessionId: input.sessionId,
      }),
    queryKey: [
      'session-file-content',
      input.projectId ?? '',
      input.sessionId ?? '',
      input.path ?? '',
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5000,
  });
}

async function fetchSessionFiles(input: {
  projectId?: string;
  sessionId?: string;
}): Promise<SessionFiles> {
  if (!input.sessionId) {
    throw new Error('Cannot load files without a selected session.');
  }

  const params = new URLSearchParams();
  if (input.projectId) {
    params.set('project', input.projectId);
  }

  const queryString = params.toString();
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(input.sessionId)}/files${
      queryString ? `?${queryString}` : ''
    }`,
    {
      headers: { Accept: 'application/json' },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to load files: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Failed to load files: expected JSON, got ${
        contentType || 'unknown content type'
      }`
    );
  }

  return sessionFilesResponseSchema.parse(await response.json());
}

async function fetchSessionFileContent(input: {
  path?: string | null;
  projectId?: string;
  sessionId?: string;
}): Promise<SessionFileContent> {
  if (!input.sessionId || !input.path) {
    throw new Error('Cannot load a file without a selected session and path.');
  }

  const params = new URLSearchParams({ path: input.path });
  if (input.projectId) {
    params.set('project', input.projectId);
  }

  const response = await fetch(
    `/api/sessions/${encodeURIComponent(input.sessionId)}/files/content?${params.toString()}`,
    {
      headers: { Accept: 'application/json' },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to load file: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Failed to load file: expected JSON, got ${
        contentType || 'unknown content type'
      }`
    );
  }

  return sessionFileContentResponseSchema.parse(await response.json());
}
