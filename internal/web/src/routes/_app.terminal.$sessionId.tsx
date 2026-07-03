import { createFileRoute } from '@tanstack/react-router';

import { TerminalPage } from '@/features/home/pages/terminal';

export const Route = createFileRoute('/_app/terminal/$sessionId')({
  component: TerminalPage,
  validateSearch: (
    search: Record<string, unknown>
  ): { detached?: '1'; project?: string } => ({
    detached:
      search.detached === '1' || search.detached === 1 ? '1' : undefined,
    project: typeof search.project === 'string' ? search.project : undefined,
  }),
});
