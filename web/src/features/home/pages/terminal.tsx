import { TerminalPanel } from '@/features/home/components/organisms/terminal-panel';
import { WorkspaceStatusView } from '@/features/home/components/organisms/workspace-status-view';
import { TerminalLayout } from '@/features/home/pages/terminal-layout';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

export function TerminalPage() {
  const context = useWorkspaceContext();

  if (context.selectedTerminalSession) {
    return (
      <TerminalLayout>
        <TerminalPanel session={context.selectedTerminalSession} />
      </TerminalLayout>
    );
  }

  return (
    <TerminalLayout>
      <section
        aria-label="Worker terminal panel"
        className="flex min-h-90 min-w-0 flex-1 flex-col border-b border-border bg-background md:min-h-0 md:border-b-0"
      >
        <WorkspaceStatusView
          error={context.workspaceError}
          onRefresh={context.onWorkspaceRefresh}
          state={
            context.workspaceState === 'ready'
              ? 'empty'
              : context.workspaceState
          }
          tone="terminal"
        />
      </section>
    </TerminalLayout>
  );
}
