import { mutationOptions } from '@tanstack/react-query';
import { z } from 'zod';

export interface AnnotationPayload {
  comment?: string;
  element?: string;
  elementPath?: string;
  id?: string;
  intent?: string;
  reactComponents?: string;
  selectedText?: string;
  severity?: string;
  url?: string;
}

export interface SendAnnotationsInput {
  annotations: AnnotationPayload[];
  projectId?: string;
  sessionId: string;
}

const sendAnnotationsResultSchema = z.object({
  delivered: z.number(),
});

export type SendAnnotationsResult = z.infer<typeof sendAnnotationsResultSchema>;

export function sendAnnotationsMutationOptions() {
  return mutationOptions({
    mutationFn: sendAnnotations,
  });
}

export function createSendAnnotationsPath(
  input: Pick<SendAnnotationsInput, 'projectId' | 'sessionId'>
) {
  const params = new URLSearchParams();
  if (input.projectId) {
    params.set('project', input.projectId);
  }

  const query = params.toString();
  const base = `/api/annotations/${encodeURIComponent(input.sessionId)}`;

  return query ? `${base}?${query}` : base;
}

export async function sendAnnotations(
  input: SendAnnotationsInput
): Promise<SendAnnotationsResult> {
  const response = await fetch(createSendAnnotationsPath(input), {
    body: JSON.stringify({ annotations: input.annotations }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await readSendAnnotationsError(response));
  }

  return sendAnnotationsResultSchema.parse(await response.json());
}

async function readSendAnnotationsError(response: Response) {
  const message = (await response.text()).trim();
  if (message) {
    return message;
  }

  return `Failed to send annotations: ${response.status}`;
}
