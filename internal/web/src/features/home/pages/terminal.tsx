import { ExternalLinkIcon, SquareTerminalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { TerminalPanel } from '@/features/home/components/organisms/terminal-panel';
import { WorkspaceStatusView } from '@/features/home/components/organisms/workspace-status-view';
import type { WorkerSession } from '@/features/home/domain/session-workspace';
import { TerminalLayout } from '@/features/home/pages/terminal-layout';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

export function TerminalPage() {
  const context = useWorkspaceContext();

  if (context.selectedTerminalSession) {
    const selectionKey = context.selectedTerminalSessionKey;

    return (
      <TerminalLayout>
        <TerminalPanel
          detached={context.terminalDetached}
          session={context.selectedTerminalSession}
          onAttachDetached={context.onTerminalSessionAttachDetached}
          onOpenDetached={
            selectionKey
              ? () => context.onTerminalSessionOpenDetached?.(selectionKey)
              : undefined
          }
        />
      </TerminalLayout>
    );
  }

  const detachedSelectionKey = context.selectedTerminalSessionKey;

  if (context.detachedTerminalSession && detachedSelectionKey) {
    return (
      <TerminalLayout>
        <DetachedTerminalPlaceholder
          sessionLabel={getTerminalSessionLabel(
            context.detachedTerminalSession
          )}
          onFocus={() =>
            context.onTerminalSessionFocusDetached?.(detachedSelectionKey)
          }
        />
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

function DetachedTerminalPlaceholder(props: {
  onFocus: () => void;
  sessionLabel: string;
}) {
  return (
    <section
      aria-label="Detached terminal placeholder"
      className="flex min-h-90 min-w-0 flex-1 flex-col border-b border-border bg-background md:min-h-0 md:border-b-0"
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background/95 p-6">
        <div className="flex w-full max-w-sm flex-col items-stretch gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-muted/30 text-muted-foreground">
              <SquareTerminalIcon className="size-4" />
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-none"
              onClick={props.onFocus}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Focus window
            </Button>
          </div>
          <div className="flex flex-col gap-1 text-left">
            <h2 className="text-sm leading-5 font-medium text-foreground">
              Terminal detached
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {props.sessionLabel} is detached. Close that window to resume the
              docked terminal here.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function getTerminalSessionLabel(session: WorkerSession) {
  return session.kind === 'orchestrator'
    ? 'Orchestrator'
    : session.title.trim() || session.workerId;
}
