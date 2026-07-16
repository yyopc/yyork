import { useHotkey } from '@tanstack/react-hotkeys';
import {
  FileDiffIcon,
  FilesIcon,
  GlobeIcon,
  LaptopIcon,
  type LucideIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SplitIcon,
} from 'lucide-react';

import { appHotkeys } from '@/lib/app-hotkeys';
import { cn } from '@/lib/tailwind/utils';

import { Logo } from '@/components/brand/logo';
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
import {
  getWorkerSessionWorkspaceMode,
  type WorkerWorkspaceMode,
} from '@/features/home/domain/session-workspace';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

// 0.75rem (slot↔button gap) + 1.75rem (toggle button) + 0.75rem (header pe-3).
// The open slot's width = canvas pane width − these trailing offsets so its
// left edge anchors to the canvas pane's left edge below.
const CANVAS_TAB_SLOT_TRAILING_PX = 52;
const canvasTabTriggerClassName =
  'rounded-sm px-3 text-xs leading-4 data-active:text-sidebar-foreground dark:data-active:text-sidebar-foreground';
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
type WorkerWorkspaceSelectScope = 'current-worker' | 'project-default';

export function MainTopbar(props: { minimal?: boolean }) {
  const { isMobile, openMobile, state } = useSidebar();
  const {
    canvasAvailable,
    canvasOpen,
    canvasTab,
    onCanvasOpenChange,
    onCanvasTabChange,
    onWorkerWorkspaceModeChange,
    selectedProject,
    selectedTerminalSession,
    workerWorkspaceModePending,
  } = useWorkspaceContext();
  const isSidebarOpen = isMobile ? openMobile : state === 'expanded';
  const canvasButtonLabel = canvasOpen
    ? 'Close Canvas side panel'
    : 'Open Canvas side panel';
  const workerWorkspaceSelectScope: WorkerWorkspaceSelectScope =
    selectedTerminalSession && selectedTerminalSession.kind !== 'orchestrator'
      ? 'current-worker'
      : 'project-default';

  const toggleCanvas = () => {
    onCanvasOpenChange(!canvasOpen);
  };
  useHotkey(appHotkeys.toggleCanvas, toggleCanvas, {
    enabled: canvasAvailable && !props.minimal,
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
        <AppBrand showAlpha={!props.minimal} />
        {!props.minimal && selectedProject ? (
          <div className="ms-auto shrink-0">
            <WorkerWorkspaceSelect
              disabled={workerWorkspaceModePending}
              scope={workerWorkspaceSelectScope}
              value={getWorkerSessionWorkspaceMode(
                selectedTerminalSession &&
                  selectedTerminalSession.kind !== 'orchestrator'
                  ? selectedTerminalSession
                  : undefined,
                selectedProject.workerWorkspaceMode
              )}
              onValueChange={onWorkerWorkspaceModeChange}
            />
          </div>
        ) : null}
      </div>

      {!props.minimal && canvasAvailable && (
        <div className="flex shrink-0 items-center gap-3">
          {canvasOpen ? (
            <div
              data-state="expanded"
              className="flex shrink-0 items-center justify-start overflow-hidden"
              style={{
                width: `calc(var(--canvas-pane-width, 0px) - ${CANVAS_TAB_SLOT_TRAILING_PX}px)`,
              }}
            >
              <div
                data-state="expanded"
                className={cn(
                  'flex items-center transition-[transform,opacity] duration-200 ease-linear',
                  'data-[state=collapsed]:translate-x-3 data-[state=collapsed]:opacity-0'
                )}
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
                    <TabsTrigger
                      className={canvasTabTriggerClassName}
                      value="files"
                    >
                      <FilesIcon
                        aria-hidden="true"
                        className="size-4"
                        data-icon="inline-start"
                      />
                      <span>Files</span>
                    </TabsTrigger>
                    <TabsTrigger
                      className={canvasTabTriggerClassName}
                      value="review"
                    >
                      <FileDiffIcon
                        aria-hidden="true"
                        className="size-4"
                        data-icon="inline-start"
                      />
                      <span>Review</span>
                    </TabsTrigger>
                    <TabsTrigger
                      className={canvasTabTriggerClassName}
                      value="browser"
                    >
                      <GlobeIcon
                        aria-hidden="true"
                        className="size-4"
                        data-icon="inline-start"
                      />
                      <span>Browser</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          ) : null}
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
  scope: WorkerWorkspaceSelectScope;
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
        className="h-7 w-fit rounded-sm border-none bg-sidebar py-0 pl-2 text-xs text-sidebar-foreground shadow-none hover:bg-sidebar-accent data-[size=sm]:h-7 [&_svg:not([class*='size-'])]:size-4"
        size="sm"
      >
        {selectedOption ? (
          <WorkerWorkspaceOptionContent
            option={selectedOption}
            scope={props.scope}
            surface="trigger"
          />
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
            <SelectItem
              key={option.value}
              className="h-7 py-0 text-xs leading-4"
              value={option.value}
            >
              <WorkerWorkspaceOptionContent
                option={option}
                scope={props.scope}
                surface="menu"
              />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function WorkerWorkspaceOptionContent(props: {
  option: WorkerWorkspaceOption;
  scope: WorkerWorkspaceSelectScope;
  surface: 'menu' | 'trigger';
}) {
  const Icon = props.option.icon;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 text-muted-foreground',
          props.option.iconClassName
        )}
      />
      <span className="truncate">{getWorkerWorkspaceOptionLabel(props)}</span>
    </span>
  );
}

function getWorkerWorkspaceOptionLabel(props: {
  option: WorkerWorkspaceOption;
  scope: WorkerWorkspaceSelectScope;
  surface: 'menu' | 'trigger';
}) {
  if (
    props.surface === 'menu' &&
    props.scope === 'current-worker' &&
    props.option.value === 'new-worktree'
  ) {
    return 'fork to worktree';
  }

  return props.option.label;
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

function AppBrand(props: { showAlpha: boolean }) {
  return (
    <div className="flex h-9 max-w-full min-w-0 items-center gap-2 justify-self-start text-sidebar-foreground">
      <BrandTypography showAlpha={props.showAlpha} />
    </div>
  );
}

function BrandTypography(props: { showAlpha: boolean }) {
  return (
    <>
      <Logo className="h-4 w-[3.75rem] shrink-0 text-sidebar-foreground" />
      {props.showAlpha ? (
        <span className="shrink-0 rounded-full border border-sidebar-border bg-sidebar-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-sidebar-primary-foreground">
          alpha
        </span>
      ) : null}
    </>
  );
}
