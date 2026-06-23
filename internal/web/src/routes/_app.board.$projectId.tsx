import { createFileRoute } from '@tanstack/react-router';

import { KanbanPage } from '@/features/home/pages/kanban';

export const Route = createFileRoute('/_app/board/$projectId')({
  component: KanbanPage,
});
