import { FirstRunProjectCard } from '@/features/home/components/organisms/first-run-project-card';
import { KanbanBoard } from '@/features/home/components/organisms/kanban-board';
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
          <FirstRunProjectCard
            className="absolute inset-0"
            phase={context.firstRunProjectSetupPhase}
            projectPath={context.stagedProjectPath}
            agentSetup={context.firstRunProjectSetupSelection}
            starting={context.projectSetupStarting}
            onAddProject={context.onAddProject}
            onChangeProject={context.onChangeStagedProject}
            onAgentSetupChange={context.onFirstRunProjectSetupSelectionChange}
            onStartProject={context.onStartProjectSetup}
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
