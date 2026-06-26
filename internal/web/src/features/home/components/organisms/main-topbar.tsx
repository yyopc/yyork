import { useHotkey } from '@tanstack/react-hotkeys';
import {
  LaptopIcon,
  type LucideIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SplitIcon,
} from 'lucide-react';

import { appHotkeys } from '@/lib/app-hotkeys';
import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { isCanvasTab } from '@/features/home/domain/canvas-tabs';
import type { WorkerWorkspaceMode } from '@/features/home/domain/session-workspace';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

// 0.75rem (slot↔button gap) + 2.25rem (toggle button) + 0.75rem (header pe-3).
// The slot's width = canvas pane width − these trailing offsets so its left
// edge anchors exactly to the canvas pane's left edge below.
const SLOT_TRAILING_PX = 60;
const workerWorkspaceOptions = [
  { icon: LaptopIcon, label: 'work locally', value: 'local' },
  {
    icon: SplitIcon,
    iconClassName: '-rotate-90',
    label: 'new worktree',
    value: 'new-worktree',
  },
] satisfies Array<{
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: WorkerWorkspaceMode;
}>;
type WorkerWorkspaceOption = (typeof workerWorkspaceOptions)[number];

export function MainTopbar() {
  const { isMobile, openMobile, state } = useSidebar();
  const {
    canvasAvailable,
    canvasOpen,
    canvasTab,
    onCanvasOpenChange,
    onCanvasTabChange,
    onWorkerWorkspaceModeChange,
    selectedProject,
    workerWorkspaceModePending,
  } = useWorkspaceContext();
  const isSidebarOpen = isMobile ? openMobile : state === 'expanded';
  const canvasButtonLabel = canvasOpen
    ? 'Close Canvas side panel'
    : 'Open Canvas side panel';

  const toggleCanvas = () => {
    onCanvasOpenChange(!canvasOpen);
  };
  useHotkey(appHotkeys.toggleCanvas, toggleCanvas, {
    enabled: canvasAvailable,
    ignoreInputs: false,
    requireReset: true,
  });

  return (
    <header
      className={cn(
        // On desktop, the collapsed sidebar leaves a fixed toggle slot.
        'flex h-15 shrink-0 items-center gap-3 border-b border-border bg-sidebar pe-3',
        isMobile || isSidebarOpen ? 'ps-3' : 'ps-15'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AppBrand />
        {selectedProject ? (
          <div className="ms-auto shrink-0">
            <WorkerWorkspaceSelect
              disabled={workerWorkspaceModePending}
              value={selectedProject.workerWorkspaceMode}
              onValueChange={onWorkerWorkspaceModeChange}
            />
          </div>
        ) : null}
      </div>

      {canvasAvailable && (
        <div className="flex shrink-0 items-center gap-3">
          <div
            data-state={canvasOpen ? 'expanded' : 'collapsed'}
            className="flex shrink-0 items-center justify-start overflow-hidden"
            style={{
              // Slot width tracks the canvas pane's actual rendered width
              // (kept in sync by the ResizeObserver in TerminalLayout). The
              // calc reflows in the same layout pass as the pane below, so
              // the slot is immediately reactive — no React render, no
              // transition lag — during sidebar collapse/expand, the resize
              // rail drag, and the open/close animation of the pane itself.
              width: `calc(var(--canvas-pane-width, 0px) - ${SLOT_TRAILING_PX}px)`,
            }}
            aria-hidden={!canvasOpen}
          >
            <div
              data-state={canvasOpen ? 'expanded' : 'collapsed'}
              className={cn(
                'flex items-center transition-[transform,opacity] duration-200 ease-linear',
                'data-[state=collapsed]:translate-x-3 data-[state=collapsed]:opacity-0'
              )}
              inert={!canvasOpen}
            >
              <Tabs
                value={canvasTab}
                onValueChange={(value) => {
                  if (isCanvasTab(value)) {
                    onCanvasTabChange(value);
                  }
                }}
              >
                <TabsList className="rounded-sm">
                  <TabsTrigger className="rounded-sm px-3" value="files">
                    Files
                  </TabsTrigger>
                  <TabsTrigger className="rounded-sm px-3" value="review">
                    Review
                  </TabsTrigger>
                  <TabsTrigger className="rounded-sm px-3" value="browser">
                    Browser
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <CanvasToggleButton
            canvasButtonLabel={canvasButtonLabel}
            canvasOpen={canvasOpen}
            onToggle={toggleCanvas}
          />
        </div>
      )}
    </header>
  );
}

function WorkerWorkspaceSelect(props: {
  disabled: boolean;
  onValueChange: (mode: WorkerWorkspaceMode) => void;
  value: WorkerWorkspaceMode;
}) {
  const selectedOption = workerWorkspaceOptions.find(
    (option) => option.value === props.value
  );

  return (
    <Select
      disabled={props.disabled}
      items={workerWorkspaceOptions}
      value={props.value}
      onValueChange={(value) => {
        if (isWorkerWorkspaceMode(value)) {
          props.onValueChange(value);
        }
      }}
    >
      <SelectTrigger
        aria-label="Worker workspace"
        className="h-7 w-fit rounded-sm border-none bg-sidebar text-xs text-sidebar-foreground shadow-none hover:bg-sidebar-accent [&_svg:not([class*='size-'])]:size-4"
        size="sm"
      >
        {selectedOption ? (
          <WorkerWorkspaceOptionContent option={selectedOption} />
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent
        align="start"
        className="w-max min-w-[var(--anchor-width)]"
      >
        <SelectGroup>
          {workerWorkspaceOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <WorkerWorkspaceOptionContent option={option} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function WorkerWorkspaceOptionContent(props: {
  option: WorkerWorkspaceOption;
}) {
  const Icon = props.option.icon;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon
        aria-hidden="true"
        className={cn('text-muted-foreground', props.option.iconClassName)}
      />
      <span className="truncate">{props.option.label}</span>
    </span>
  );
}

function isWorkerWorkspaceMode(value: unknown): value is WorkerWorkspaceMode {
  return value === 'new-worktree' || value === 'local';
}

function CanvasToggleButton(props: {
  canvasButtonLabel: string;
  canvasOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
            aria-label={props.canvasButtonLabel}
            aria-pressed={props.canvasOpen}
            onClick={props.onToggle}
          />
        }
      >
        {props.canvasOpen ? (
          <PanelRightCloseIcon aria-hidden="true" />
        ) : (
          <PanelRightOpenIcon aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p>{props.canvasButtonLabel}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AppBrand() {
  return (
    <div className="flex h-9 max-w-full min-w-0 items-center gap-2 justify-self-start text-sidebar-foreground">
      <BrandTypography />
    </div>
  );
}

function BrandTypography() {
  return (
    <>
      <span className="truncate text-base leading-6 font-bold">yyork</span>
      <span className="shrink-0 rounded-full border border-sidebar-border bg-sidebar-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-sidebar-primary-foreground">
        alpha
      </span>
    </>
  );
}
