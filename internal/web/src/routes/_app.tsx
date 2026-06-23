import { createFileRoute } from '@tanstack/react-router';

import { WorkspaceLayout } from '@/features/home/pages/workspace-layout';

export const Route = createFileRoute('/_app')({
  component: WorkspaceLayout,
});
