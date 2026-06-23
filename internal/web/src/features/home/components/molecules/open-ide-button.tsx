import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { openSessionIdeMutationOptions } from '@/features/home/data/session-ide';
import type { WorkerSession } from '@/features/home/domain/session-workspace';

export function OpenIdeButton(props: {
  session?: Pick<WorkerSession, 'cwd' | 'id' | 'project' | 'title'>;
}) {
  const openIdeMutation = useMutation(openSessionIdeMutationOptions());
  const canOpenIDE = !!props.session?.cwd;
  const label = canOpenIDE
    ? `Open ${props.session?.title ?? 'session'} workspace in IDE`
    : 'Session workspace path unavailable';

  function handleOpenIDE() {
    if (!props.session) {
      return;
    }

    openIdeMutation.mutate(props.session, {
      onError: (error) => {
        toast.error('Could not open IDE', {
          description:
            error instanceof Error
              ? error.message
              : 'The local IDE could not be opened.',
        });
      },
      onSuccess: (result) => {
        toast.success('Opened IDE', {
          description: result.cwd,
        });
      },
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canOpenIDE || openIdeMutation.isPending}
          onClick={() => {
            handleOpenIDE();
          }}
          className="h-7 cursor-pointer rounded-none border-r-0 shadow-none disabled:cursor-not-allowed"
        >
          {openIdeMutation.isPending ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <span
              data-icon="inline-start"
              className="size-4 shrink-0 bg-current [mask:url('/editor-icons/visual-studio.svg')_center/contain_no-repeat]"
              aria-hidden="true"
            />
          )}
          Open IDE
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
