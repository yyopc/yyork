import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useBrowserHistoryNavigation } from '@/hooks/use-navigate-back';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function HistoryNavigationButtons() {
  const { canGoBack, canGoForward, navigateBack, navigateForward } =
    useBrowserHistoryNavigation();

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <HistoryNavigationButton
        ariaLabel="Go back"
        disabled={!canGoBack}
        onClick={() => {
          navigateBack();
        }}
        tooltip="Go back"
      >
        <ArrowLeftIcon aria-hidden="true" />
      </HistoryNavigationButton>
      <HistoryNavigationButton
        ariaLabel="Go forward"
        disabled={!canGoForward}
        onClick={() => {
          navigateForward();
        }}
        tooltip="Go forward"
      >
        <ArrowRightIcon aria-hidden="true" />
      </HistoryNavigationButton>
    </div>
  );
}

function HistoryNavigationButton(props: {
  ariaLabel: string;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-40 dark:hover:bg-sidebar-accent"
            aria-label={props.ariaLabel}
            disabled={props.disabled}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>
        <p>{props.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
