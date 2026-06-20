import { KanbanBoard } from '@/features/home/components/organisms/kanban-board';
import { NoProjectsEmptyState } from '@/features/home/components/organisms/no-projects-empty-state';
import { WorkspaceStatusView } from '@/features/home/components/organisms/workspace-status-view';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

export function KanbanPage() {
  const context = useWorkspaceContext();

  const showNoProjects =
    context.workspaceState === 'empty' && !context.hasProjects;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <KanbanBoard
        className="flex-1"
        columns={context.kanbanColumns}
        onSessionSelect={context.onWorkerSessionSelect}
      />
      {context.workspaceState !== 'ready' ? (
        showNoProjects ? (
          <NoProjectsEmptyState
            className="absolute inset-0"
            onAddProject={context.onAddProject}
          />
        ) : (
          <WorkspaceStatusView
            className="absolute inset-0"
            error={context.workspaceError}
            onRefresh={context.onWorkspaceRefresh}
            state={context.workspaceState}
          />
        )
      ) : null}
    </div>
  );
}
