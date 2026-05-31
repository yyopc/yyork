import { createFileRoute } from '@tanstack/react-router';

import { TerminalPage } from '@/features/home/pages/terminal';

export const Route = createFileRoute('/_app/terminal/$sessionId')({
  component: TerminalPage,
});
