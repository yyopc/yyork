import {
  AlertTriangleIcon,
  RefreshCcwIcon,
  SquareTerminalIcon,
} from 'lucide-react';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export type WorkspacePanelState = 'empty' | 'error' | 'loading' | 'ready';

export function WorkspaceStatusView(props: {
  className?: string;
  error?: string;
  onRefresh: () => void;
  state: Exclude<WorkspacePanelState, 'ready'>;
  tone?: 'default' | 'terminal';
}) {
  const content = getWorkspaceStatusContent(props.state, props.error);
  const isLoading = props.state === 'loading';

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background/95 p-6',
        props.className
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-stretch gap-3">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground',
              props.tone === 'terminal' && 'bg-muted/30'
            )}
          >
            {isLoading ? (
              <Spinner className="size-4" />
            ) : props.state === 'error' ? (
              <AlertTriangleIcon className="size-4" />
            ) : (
              <SquareTerminalIcon className="size-4" />
            )}
          </span>
          {!isLoading ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-none"
              onClick={props.onRefresh}
            >
              <RefreshCcwIcon data-icon="inline-start" />
              Refresh
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-sm leading-5 font-medium text-foreground">
            {content.title}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {content.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function getWorkspaceStatusContent(
  state: Exclude<WorkspacePanelState, 'ready'>,
  error?: string
) {
  switch (state) {
    case 'loading':
      return {
        title: 'Loading AO workspace',
        description: 'Reading the local Agent Orchestrator runtime.',
      };
    case 'error':
      return {
        title: 'Workspace unavailable',
        description:
          error ?? 'The local Agent Orchestrator runtime could not be read.',
      };
    case 'empty':
      return {
        title: 'No AO workers detected',
        description: 'Start or resume a worker, then refresh this workspace.',
      };
  }
}
