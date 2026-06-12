import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  EyeOffIcon,
  FolderIcon,
  FolderOpenIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Settings2Icon,
  SquareKanbanIcon,
  SquareTerminalIcon,
  SunIcon,
  SunMoonIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/tailwind/utils';
import { useHydrated } from '@/hooks/use-hydrated';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { HistoryNavigationButtons } from '@/features/home/components/molecules/history-navigation-buttons';
import {
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  type TerminalSessionKind,
  type WorkerSession,
  type WorkerSessionGroupData,
  type WorkerSessionState,
} from '@/features/home/domain/session-workspace';

const themeOptions = [
  { icon: SunMoonIcon, label: 'System', value: 'system' },
  { icon: SunIcon, label: 'Light', value: 'light' },
  { icon: MoonIcon, label: 'Dark', value: 'dark' },
] as const;

interface PinnedTerminalSessionItem {
  elapsedLabel?: string;
  isPinned?: boolean;
  kind?: TerminalSessionKind;
  label: string;
  selectionKey: string;
}

export function ProjectOrchestratorSidebar(props: {
  activeBoardProjectId?: string;
  onAddProject?: () => void;
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onProjectBoardSelect: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectIdeOpen?: (project: ProjectOrchestrator) => void;
  onProjectPinToggle?: (projectId: string) => void;
  onProjectOpenChange: (projectId: string, open: boolean) => void;
  onProjectRename?: (projectId: string) => void;
  onSettingsOpen?: () => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionGroupOpenChange: (
    groupId: WorkerSessionState,
    open: boolean
  ) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  pinnedProjectIds?: string[];
  pinnedTerminalSessionKeys?: string[];
  openProjectIds?: string[];
  openWorkerSessionGroupIds?: WorkerSessionState[];
  orchestrators: WorkerSession[];
  projects: ProjectOrchestrator[];
  selectedProjectId: string;
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const pinnedProjectIds = props.pinnedProjectIds ?? [];
  const pinnedTerminalSessionKeys = props.pinnedTerminalSessionKeys ?? [];

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeaderToolbar />

      <SidebarContent className="gap-3 overflow-hidden p-3">
        <PinnedSidebarGroup
          onOrchestratorSessionSelect={props.onOrchestratorSessionSelect}
          onProjectOpenChange={props.onProjectOpenChange}
          onProjectPinToggle={props.onProjectPinToggle}
          onTerminalSessionDelete={props.onTerminalSessionDelete}
          onTerminalSessionHide={props.onTerminalSessionHide}
          onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
          onTerminalSessionRename={props.onTerminalSessionRename}
          onWorkerSessionSelect={props.onWorkerSessionSelect}
          orchestrators={props.orchestrators}
          pinnedProjectIds={pinnedProjectIds}
          pinnedTerminalSessionKeys={pinnedTerminalSessionKeys}
          projects={props.projects}
          selectedTerminalSessionKey={props.selectedTerminalSessionKey}
          tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
          workerSessionGroups={props.workerSessionGroups}
        />

        <SidebarGroup
          role="navigation"
          className="gap-1 px-0"
          aria-label="Projects"
        >
          <div className="flex h-5 items-center justify-between px-1">
            <SidebarGroupLabel className="h-auto px-0 text-xs leading-4 font-medium opacity-60">
              Projects
            </SidebarGroupLabel>
            <ActionTooltip
              label="Add project"
              trigger={
                <SidebarGroupAction
                  render={<button type="button" aria-label="Add project" />}
                  aria-label="Add project"
                  className="static top-auto right-auto size-5 shrink-0 rounded-sm"
                  onClick={props.onAddProject}
                />
              }
            >
              <PlusIcon aria-hidden="true" />
            </ActionTooltip>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="min-w-0">
              {props.projects.map((project) => (
                <ProjectNavItem
                  key={project.id}
                  project={project}
                  isBoardActive={project.id === props.activeBoardProjectId}
                  open={
                    props.openProjectIds
                      ? props.openProjectIds.includes(project.id)
                      : project.id === props.selectedProjectId
                  }
                  onOpenChange={(open) =>
                    props.onProjectOpenChange(project.id, open)
                  }
                  onProjectBoardSelect={props.onProjectBoardSelect}
                  onProjectDelete={props.onProjectDelete}
                  onProjectIdeOpen={props.onProjectIdeOpen}
                  onProjectRename={props.onProjectRename}
                  onTerminalSessionDelete={props.onTerminalSessionDelete}
                  onTerminalSessionHide={props.onTerminalSessionHide}
                  onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
                  onTerminalSessionRename={props.onTerminalSessionRename}
                  selectedTerminalSessionKey={props.selectedTerminalSessionKey}
                  orchestrators={props.orchestrators}
                  onOrchestratorSessionSelect={
                    props.onOrchestratorSessionSelect
                  }
                  pinnedTerminalSessionKeys={pinnedTerminalSessionKeys}
                  openWorkerSessionGroupIds={props.openWorkerSessionGroupIds}
                  onWorkerSessionGroupOpenChange={
                    props.onWorkerSessionGroupOpenChange
                  }
                  onWorkerSessionSelect={props.onWorkerSessionSelect}
                  tooltipDevtoolActionsVisible={
                    props.tooltipDevtoolActionsVisible
                  }
                  workerSessionGroups={props.workerSessionGroups}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="hidden min-h-0 flex-1 md:block" />
        <AppShortcutHints />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu className="min-w-0">
          <SidebarMenuItem>
            <SettingsMenu onSettingsOpen={props.onSettingsOpen} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function PinnedSidebarGroup(props: {
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onProjectOpenChange: (projectId: string, open: boolean) => void;
  onProjectPinToggle?: (projectId: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  orchestrators: WorkerSession[];
  pinnedProjectIds: string[];
  pinnedTerminalSessionKeys: string[];
  projects: ProjectOrchestrator[];
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const pinnedProjects = props.projects.filter((project) =>
    props.pinnedProjectIds.includes(project.id)
  );
  const pinnedTerminalSessions = getPinnedTerminalSessions({
    orchestrators: props.orchestrators,
    pinnedTerminalSessionKeys: props.pinnedTerminalSessionKeys,
    projects: props.projects,
    workerSessionGroups: props.workerSessionGroups,
  });

  return (
    <SidebarGroup role="navigation" className="gap-1 px-0" aria-label="Pinned">
      <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
        Pinned
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="min-w-0">
          {pinnedProjects.length === 0 &&
          pinnedTerminalSessions.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <button
                    type="button"
                    disabled
                    aria-label="No pinned sessions"
                  />
                }
                size="sm"
                className="h-7 w-full px-2 text-sidebar-foreground/60"
              >
                <span>No pinned sessions</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {pinnedProjects.map((project) => (
            <SidebarMenuItem key={`project:${project.id}`}>
              <ActionTooltip
                label={`Open ${project.name}`}
                trigger={
                  <SidebarMenuButton
                    render={
                      <button
                        type="button"
                        aria-label={`Open ${project.name}`}
                      />
                    }
                    className="h-7 rounded-sm pr-3 text-sm leading-5"
                    onClick={() => props.onProjectOpenChange(project.id, true)}
                  />
                }
              >
                <FolderIcon aria-hidden="true" />
                <span>{project.name}</span>
              </ActionTooltip>
              <PinToggleAction
                isPinned={true}
                label={`Unpin ${project.name}`}
                onToggle={() => props.onProjectPinToggle?.(project.id)}
                tooltipDevtoolActionsVisible={
                  props.tooltipDevtoolActionsVisible
                }
              />
            </SidebarMenuItem>
          ))}
          {pinnedTerminalSessions.map((session) => (
            <PinnedTerminalSessionNavItem
              key={session.selectionKey}
              onOrchestratorSessionSelect={props.onOrchestratorSessionSelect}
              onTerminalSessionDelete={props.onTerminalSessionDelete}
              onTerminalSessionHide={props.onTerminalSessionHide}
              onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
              onTerminalSessionRename={props.onTerminalSessionRename}
              onWorkerSessionSelect={props.onWorkerSessionSelect}
              selectedTerminalSessionKey={props.selectedTerminalSessionKey}
              session={session}
              tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function PinnedTerminalSessionNavItem(props: {
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  selectedTerminalSessionKey?: string;
  session: PinnedTerminalSessionItem;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  const { session } = props;
  const openSession = () => {
    if (session.kind === 'worker') {
      props.onWorkerSessionSelect(session.selectionKey);
      return;
    }

    props.onOrchestratorSessionSelect(session.selectionKey);
  };

  return (
    <SidebarMenuItem key={session.selectionKey} className="group/session-row">
      <SessionContextMenu
        isPinned={session.isPinned}
        onOpen={openSession}
        onPinToggle={
          props.onTerminalSessionPinToggle
            ? () => props.onTerminalSessionPinToggle?.(session.selectionKey)
            : undefined
        }
        onRename={
          props.onTerminalSessionRename
            ? () =>
                props.onTerminalSessionRename?.(
                  session.selectionKey,
                  session.label
                )
            : undefined
        }
        onDelete={
          props.onTerminalSessionDelete
            ? () =>
                props.onTerminalSessionDelete?.(
                  session.selectionKey,
                  session.label
                )
            : undefined
        }
        onHide={
          props.onTerminalSessionHide
            ? () =>
                props.onTerminalSessionHide?.(
                  session.selectionKey,
                  session.label
                )
            : undefined
        }
      >
        <ActionTooltip
          label={getPinnedTerminalSessionActionLabel(session)}
          trigger={
            <SidebarMenuButton
              render={
                <button
                  type="button"
                  aria-label={getPinnedTerminalSessionActionLabel(session)}
                />
              }
              isActive={
                session.selectionKey === props.selectedTerminalSessionKey
              }
              className="h-7 rounded-sm pe-3! text-sm leading-5 font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground [&>span:last-child]:pe-0!"
              onClick={openSession}
            />
          }
        >
          <WorkerSessionNavLabel
            elapsedLabel={session.elapsedLabel}
            hasRowActions={true}
            label={session.label}
            rowActionsAlwaysVisible={props.tooltipDevtoolActionsVisible}
          />
        </ActionTooltip>
        <WorkerSessionRowActions
          alwaysVisible={props.tooltipDevtoolActionsVisible}
          isPinned={true}
          label={session.label}
          onDelete={
            props.onTerminalSessionDelete
              ? () =>
                  props.onTerminalSessionDelete?.(
                    session.selectionKey,
                    session.label
                  )
              : undefined
          }
          onPinToggle={() =>
            props.onTerminalSessionPinToggle?.(session.selectionKey)
          }
        />
      </SessionContextMenu>
    </SidebarMenuItem>
  );
}

function SettingsMenu(props: { onSettingsOpen?: () => void }) {
  const { setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const selectedTheme = hydrated ? theme : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            render={<button type="button" aria-label="Settings" />}
            className="h-9 rounded-sm border border-sidebar-border bg-sidebar text-sm leading-5 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={props.onSettingsOpen}
          />
        }
      >
        <Settings2Icon aria-hidden="true" />
        <span>Settings</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--anchor-width) min-w-(--anchor-width)"
      >
        <DropdownMenuItem disabled>
          <Settings2Icon aria-hidden="true" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoonIcon aria-hidden="true" />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-36">
            {themeOptions.map((option) => {
              const ThemeIcon = option.icon;

              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                  }}
                >
                  <CheckIcon
                    aria-hidden="true"
                    className={cn(
                      'size-4',
                      selectedTheme === option.value
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <ThemeIcon aria-hidden="true" />
                  <span>{option.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarHeaderToolbar() {
  const { isMobile, openMobile, state } = useSidebar();
  const isExpanded = isMobile ? openMobile : state === 'expanded';
  const showCollapsedToggle = !isMobile && !isExpanded;

  return showCollapsedToggle ? (
    <div className="fixed top-0 left-0 z-30 flex h-15 w-15 items-center justify-center border-b border-sidebar-border bg-sidebar">
      <SidebarToggleButton />
    </div>
  ) : (
    <SidebarHeader className="flex h-15 shrink-0 flex-row items-center border-b border-sidebar-border p-0 px-3">
      {sidebarHeaderToolbarContent}
    </SidebarHeader>
  );
}

const sidebarHeaderToolbarContent = (
  <div className="flex w-full min-w-0 items-center justify-between gap-2">
    <SidebarToggleButton />
    <HistoryNavigationButtons />
  </div>
);

function SidebarToggleButton() {
  const { isMobile, openMobile, state } = useSidebar();
  const isOpen = isMobile ? openMobile : state === 'expanded';
  const label = isOpen ? 'Collapse project sidebar' : 'Expand project sidebar';
  const SidebarToggleIcon = isOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            variant="secondary"
            size="icon"
            className="size-7 rounded-sm border-sidebar-border bg-sidebar shadow-none"
            icon={<SidebarToggleIcon />}
            aria-label={label}
          />
        }
      />
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AppShortcutHints() {
  return (
    <SidebarGroup className="shrink-0 gap-1 px-0" aria-label="App shortcuts">
      <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
        Shortcuts
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="flex min-w-0 flex-col gap-1 px-1 text-xs leading-4 text-sidebar-foreground/70">
          <div className="flex h-6 min-w-0 items-center justify-between gap-2">
            <span className="truncate">Open command palette</span>
            <KbdGroup className="shrink-0">
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                ⌘
              </Kbd>
              <span aria-hidden="true">+</span>
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                K
              </Kbd>
            </KbdGroup>
          </div>
          <div className="flex h-6 min-w-0 items-center justify-between gap-2">
            <span className="truncate">Toggle sidebar</span>
            <KbdGroup className="shrink-0">
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                ⌘
              </Kbd>
              <span aria-hidden="true">+</span>
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                B
              </Kbd>
            </KbdGroup>
          </div>
          <div className="flex h-6 min-w-0 items-center justify-between gap-2">
            <span className="truncate">Toggle canvas</span>
            <KbdGroup className="shrink-0">
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                ⌘
              </Kbd>
              <span aria-hidden="true">+</span>
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                ⇧
              </Kbd>
              <span aria-hidden="true">+</span>
              <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">
                B
              </Kbd>
            </KbdGroup>
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ProjectNavItem(props: {
  isBoardActive: boolean;
  onProjectBoardSelect: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectIdeOpen?: (project: ProjectOrchestrator) => void;
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onOpenChange: (open: boolean) => void;
  onProjectRename?: (projectId: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionGroupOpenChange: (
    groupId: WorkerSessionState,
    open: boolean
  ) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  open: boolean;
  openWorkerSessionGroupIds?: WorkerSessionState[];
  orchestrators: WorkerSession[];
  pinnedTerminalSessionKeys: string[];
  project: ProjectOrchestrator;
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const FolderToggleIcon = props.open ? FolderOpenIcon : FolderIcon;

  return (
    <SidebarMenuItem>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <div className="relative flex min-w-0 items-center">
          <ActionTooltip
            label={
              props.open
                ? `Collapse ${props.project.name} workers`
                : `Expand ${props.project.name} workers`
            }
            trigger={
              <CollapsibleTrigger
                render={
                  <button
                    type="button"
                    aria-label={
                      props.open
                        ? `Collapse ${props.project.name} workers`
                        : `Expand ${props.project.name} workers`
                    }
                  />
                }
                className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:opacity-60"
              />
            }
          >
            <FolderToggleIcon aria-hidden="true" />
          </ActionTooltip>
          <ActionTooltip
            label={`Open ${props.project.name} board`}
            trigger={
              <SidebarMenuButton
                render={
                  <button
                    type="button"
                    aria-label={`Open ${props.project.name} board`}
                  />
                }
                isActive={props.isBoardActive}
                size="sm"
                className="h-7 min-w-0 flex-1 rounded-sm ps-2 pe-8 text-sm leading-5 font-normal [&>span:last-child]:pe-0!"
                onClick={() => props.onProjectBoardSelect(props.project.id)}
              />
            }
          >
            <span>{props.project.name}</span>
          </ActionTooltip>
          <ProjectActionsMenu
            onDelete={() => props.onProjectDelete?.(props.project.id)}
            onOpenKanban={() => props.onProjectBoardSelect(props.project.id)}
            onOpenProject={() => props.onProjectIdeOpen?.(props.project)}
            onRename={() => props.onProjectRename?.(props.project.id)}
            projectCwd={props.project.cwd}
            projectName={props.project.name}
            tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
          />
        </div>
        <CollapsibleContent className="pt-1">
          <ProjectWorkerSessionTree
            groups={props.workerSessionGroups}
            onOrchestratorSessionSelect={props.onOrchestratorSessionSelect}
            onWorkerSessionGroupOpenChange={
              props.onWorkerSessionGroupOpenChange
            }
            projectId={props.project.id}
            orchestrators={props.orchestrators}
            openWorkerSessionGroupIds={props.openWorkerSessionGroupIds}
            pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys}
            selectedTerminalSessionKey={props.selectedTerminalSessionKey}
            onTerminalSessionDelete={props.onTerminalSessionDelete}
            onTerminalSessionHide={props.onTerminalSessionHide}
            onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
            onTerminalSessionRename={props.onTerminalSessionRename}
            onWorkerSessionSelect={props.onWorkerSessionSelect}
            tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
          />
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function ProjectWorkerSessionTree(props: {
  groups: WorkerSessionGroupData[];
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionGroupOpenChange: (
    groupId: WorkerSessionState,
    open: boolean
  ) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  openWorkerSessionGroupIds?: WorkerSessionState[];
  orchestrators: WorkerSession[];
  pinnedTerminalSessionKeys: string[];
  projectId: string;
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  const pinnedTerminalSessionKeys = new Set(props.pinnedTerminalSessionKeys);
  const projectOrchestrators = props.orchestrators.filter(
    (orchestrator) =>
      orchestrator.project === props.projectId &&
      !pinnedTerminalSessionKeys.has(getWorkerSessionSelectionKey(orchestrator))
  );

  const groupsWithSessions = props.groups.reduce<WorkerSessionGroupData[]>(
    (groups, group) => {
      const sessions = group.sessions.filter(
        (session) =>
          session.project === props.projectId &&
          !pinnedTerminalSessionKeys.has(session.selectionKey)
      );

      if (sessions.length > 0) {
        groups.push({ ...group, sessions });
      }

      return groups;
    },
    []
  );

  if (groupsWithSessions.length === 0 && projectOrchestrators.length === 0) {
    return (
      <ul className="flex w-full min-w-0 flex-col gap-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            render={
              <button type="button" disabled aria-label="No worker sessions" />
            }
            size="sm"
            className="h-7 w-full ps-16 pe-2 text-sidebar-foreground/60"
          >
            <span>No worker sessions</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </ul>
    );
  }

  return (
    <ul className="flex w-full min-w-0 flex-col gap-1">
      {projectOrchestrators.map((orchestrator) => {
        const selectionKey = getWorkerSessionSelectionKey(orchestrator);
        const orchestratorLabel = 'Orchestrator';

        return (
          <SidebarMenuItem key={selectionKey} className="group/session-row">
            <SessionContextMenu
              isPinned={props.pinnedTerminalSessionKeys.includes(selectionKey)}
              onOpen={() => props.onOrchestratorSessionSelect(selectionKey)}
              onPinToggle={
                props.onTerminalSessionPinToggle
                  ? () => props.onTerminalSessionPinToggle?.(selectionKey)
                  : undefined
              }
              onRename={
                props.onTerminalSessionRename
                  ? () =>
                      props.onTerminalSessionRename?.(
                        selectionKey,
                        orchestratorLabel
                      )
                  : undefined
              }
              onDelete={
                props.onTerminalSessionDelete
                  ? () =>
                      props.onTerminalSessionDelete?.(
                        selectionKey,
                        orchestratorLabel
                      )
                  : undefined
              }
              onHide={
                props.onTerminalSessionHide
                  ? () =>
                      props.onTerminalSessionHide?.(
                        selectionKey,
                        orchestratorLabel
                      )
                  : undefined
              }
            >
              <ActionTooltip
                label={`Open ${orchestratorLabel} terminal`}
                trigger={
                  <SidebarMenuButton
                    render={
                      <button
                        type="button"
                        aria-label={`Open ${orchestratorLabel} terminal`}
                      />
                    }
                    isActive={selectionKey === props.selectedTerminalSessionKey}
                    size="sm"
                    className="h-7 w-full ps-10 pe-3! font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground [&>span:last-child]:pe-0!"
                    onClick={() =>
                      props.onOrchestratorSessionSelect(selectionKey)
                    }
                  />
                }
              >
                <WorkerSessionNavLabel
                  hasRowActions={true}
                  label={orchestratorLabel}
                  rowActionsAlwaysVisible={props.tooltipDevtoolActionsVisible}
                />
              </ActionTooltip>
              <WorkerSessionRowActions
                alwaysVisible={props.tooltipDevtoolActionsVisible}
                isPinned={props.pinnedTerminalSessionKeys.includes(
                  selectionKey
                )}
                label={orchestratorLabel}
                onDelete={
                  props.onTerminalSessionDelete
                    ? () =>
                        props.onTerminalSessionDelete?.(
                          selectionKey,
                          orchestratorLabel
                        )
                    : undefined
                }
                onPinToggle={() =>
                  props.onTerminalSessionPinToggle?.(selectionKey)
                }
              />
            </SessionContextMenu>
          </SidebarMenuItem>
        );
      })}
      {groupsWithSessions.map((group) => (
        <ProjectWorkerSessionGroup
          key={group.id}
          group={group}
          open={
            props.openWorkerSessionGroupIds
              ? props.openWorkerSessionGroupIds.includes(group.id)
              : true
          }
          onOpenChange={(open) =>
            props.onWorkerSessionGroupOpenChange(group.id, open)
          }
          onTerminalSessionDelete={props.onTerminalSessionDelete}
          onTerminalSessionHide={props.onTerminalSessionHide}
          onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
          onTerminalSessionRename={props.onTerminalSessionRename}
          pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys}
          selectedTerminalSessionKey={props.selectedTerminalSessionKey}
          onWorkerSessionSelect={props.onWorkerSessionSelect}
          tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
        />
      ))}
    </ul>
  );
}

function ProjectWorkerSessionGroup(props: {
  group: WorkerSessionGroupData;
  onOpenChange: (open: boolean) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  open: boolean;
  pinnedTerminalSessionKeys: string[];
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  return (
    <SidebarMenuItem>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <ActionTooltip
          label={
            props.open
              ? `Collapse ${props.group.label} sessions`
              : `Expand ${props.group.label} sessions`
          }
          trigger={
            <CollapsibleTrigger
              render={
                <SidebarMenuButton
                  render={
                    <button
                      type="button"
                      aria-label={
                        props.open
                          ? `Collapse ${props.group.label} sessions`
                          : `Expand ${props.group.label} sessions`
                      }
                    />
                  }
                  size="sm"
                  className="h-7 w-full ps-9 pr-3 font-light text-muted-foreground/80 hover:text-muted-foreground active:text-muted-foreground data-[active=true]:text-muted-foreground"
                />
              }
            />
          }
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={props.open ? undefined : '-rotate-90'}
          />
          <span>{props.group.label}</span>
        </ActionTooltip>
        <SidebarMenuBadge>{props.group.sessions.length}</SidebarMenuBadge>
        <CollapsibleContent className="pt-1">
          <ul className="flex w-full min-w-0 flex-col gap-1 py-0.5">
            {props.group.sessions.map((session) => {
              const sessionLabel = session.label;

              return (
                <SidebarMenuItem
                  key={session.selectionKey}
                  className="group/session-row"
                >
                  <SessionContextMenu
                    isPinned={props.pinnedTerminalSessionKeys.includes(
                      session.selectionKey
                    )}
                    onOpen={() =>
                      props.onWorkerSessionSelect(session.selectionKey)
                    }
                    onPinToggle={
                      props.onTerminalSessionPinToggle
                        ? () =>
                            props.onTerminalSessionPinToggle?.(
                              session.selectionKey
                            )
                        : undefined
                    }
                    onRename={
                      props.onTerminalSessionRename
                        ? () =>
                            props.onTerminalSessionRename?.(
                              session.selectionKey,
                              sessionLabel
                            )
                        : undefined
                    }
                    onDelete={
                      props.onTerminalSessionDelete
                        ? () =>
                            props.onTerminalSessionDelete?.(
                              session.selectionKey,
                              sessionLabel
                            )
                        : undefined
                    }
                    onHide={
                      props.onTerminalSessionHide
                        ? () =>
                            props.onTerminalSessionHide?.(
                              session.selectionKey,
                              sessionLabel
                            )
                        : undefined
                    }
                  >
                    <ActionTooltip
                      label={`Open ${sessionLabel} terminal`}
                      trigger={
                        <SidebarMenuButton
                          render={
                            <button
                              type="button"
                              aria-label={`Open ${sessionLabel} terminal`}
                            />
                          }
                          isActive={
                            session.selectionKey ===
                            props.selectedTerminalSessionKey
                          }
                          size="sm"
                          className="h-7 w-full ps-16 pe-3! font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground [&>span:last-child]:pe-0!"
                          onClick={() =>
                            props.onWorkerSessionSelect(session.selectionKey)
                          }
                        />
                      }
                    >
                      <WorkerSessionNavLabel
                        elapsedLabel={session.elapsedLabel}
                        hasRowActions={true}
                        label={sessionLabel}
                        rowActionsAlwaysVisible={
                          props.tooltipDevtoolActionsVisible
                        }
                      />
                    </ActionTooltip>
                    <WorkerSessionRowActions
                      alwaysVisible={props.tooltipDevtoolActionsVisible}
                      isPinned={props.pinnedTerminalSessionKeys.includes(
                        session.selectionKey
                      )}
                      label={sessionLabel}
                      onDelete={
                        props.onTerminalSessionDelete
                          ? () =>
                              props.onTerminalSessionDelete?.(
                                session.selectionKey,
                                sessionLabel
                              )
                          : undefined
                      }
                      onPinToggle={() =>
                        props.onTerminalSessionPinToggle?.(session.selectionKey)
                      }
                    />
                  </SessionContextMenu>
                </SidebarMenuItem>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function ProjectActionsMenu(props: {
  onDelete: () => void;
  onOpenKanban: () => void;
  onOpenProject: () => void;
  onRename: () => void;
  projectCwd?: string;
  projectName: string;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  return (
    <DropdownMenu>
      <ActionTooltip
        label={`Open ${props.projectName} actions`}
        trigger={
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                aria-label={`${props.projectName} actions`}
                className={cn(
                  getRowScopedActionClassName(
                    props.tooltipDevtoolActionsVisible
                  ),
                  projectMenuActionClassName
                )}
              />
            }
          />
        }
      >
        <EllipsisIcon aria-hidden="true" />
      </ActionTooltip>
      <DropdownMenuContent align="end" side="right" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={!props.projectCwd}
            onClick={props.onOpenProject}
          >
            <FolderOpenIcon aria-hidden="true" />
            <span>Open project</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={props.onOpenKanban}>
            <SquareKanbanIcon aria-hidden="true" />
            <span>Open Kanban</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={props.onRename}>
            <PencilIcon aria-hidden="true" />
            <span>Rename project</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={props.onDelete}>
            <Trash2Icon aria-hidden="true" />
            <span>Delete project</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionContextMenu(props: {
  children: ReactNode;
  isPinned?: boolean;
  onDelete?: () => void;
  onHide?: () => void;
  onOpen: () => void;
  onPinToggle?: () => void;
  onRename?: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents" />}>
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent align="start" side="right" className="min-w-44">
        <ContextMenuItem
          disabled={!props.onPinToggle}
          onClick={props.onPinToggle}
        >
          {props.isPinned ? (
            <PinOffIcon aria-hidden="true" />
          ) : (
            <PinIcon aria-hidden="true" />
          )}
          <span>{props.isPinned ? 'Unpin' : 'Pin'}</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={props.onOpen}>
          <SquareTerminalIcon aria-hidden="true" />
          <span>Open terminal</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!props.onRename} onClick={props.onRename}>
          <PencilIcon aria-hidden="true" />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!props.onHide} onClick={props.onHide}>
          <EyeOffIcon aria-hidden="true" />
          <span>Hide from sidebar</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={!props.onDelete}
          onClick={props.onDelete}
        >
          <Trash2Icon aria-hidden="true" />
          <span>Stop session</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function PinToggleAction(props: {
  isPinned: boolean;
  label: string;
  onToggle: () => void;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  return (
    <ActionTooltip
      label={props.label}
      trigger={
        <SidebarMenuAction
          aria-label={props.label}
          className={cn(
            pinActionColorClassName,
            !props.isPinned &&
              getRowScopedActionClassName(props.tooltipDevtoolActionsVisible)
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onToggle();
          }}
        />
      }
    >
      {props.isPinned ? (
        <PinOffIcon aria-hidden="true" />
      ) : (
        <PinIcon aria-hidden="true" />
      )}
    </ActionTooltip>
  );
}

type TooltipSide = ComponentProps<typeof TooltipContent>['side'];

function ActionTooltip(props: {
  children: ReactNode;
  label: string;
  side?: TooltipSide;
  trigger: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.trigger}>{props.children}</TooltipTrigger>
      <TooltipContent side={props.side ?? 'right'}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const rowScopedActionClassName =
  'md:opacity-0 peer-hover/menu-button:opacity-100 hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100';
const rowScopedActionDevtoolClassName = 'opacity-100';
const projectMenuActionClassName =
  'right-1! top-1/2 -translate-y-1/2 peer-data-[size=sm]/menu-button:top-1/2 peer-data-[size=sm]/menu-button:-translate-y-1/2';
const pinActionColorClassName =
  'bg-transparent text-sidebar-foreground/60 peer-hover/menu-button:text-sidebar-foreground/60 hover:bg-transparent hover:text-sidebar-foreground/80 active:bg-transparent focus-visible:bg-transparent focus-visible:text-sidebar-foreground/80 data-[state=open]:bg-transparent data-[state=open]:text-sidebar-foreground/80';

function WorkerSessionNavLabel(props: {
  elapsedLabel?: string;
  hasRowActions?: boolean;
  label: string;
  rowActionsAlwaysVisible?: boolean;
}) {
  const elapsedHiddenClass = props.hasRowActions
    ? props.rowActionsAlwaysVisible
      ? 'hidden'
      : 'group-hover/session-row:hidden group-focus-within/session-row:hidden'
    : undefined;

  return (
    <span className="flex w-full min-w-0 flex-1 items-center gap-2">
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          props.elapsedLabel && 'pr-12',
          props.hasRowActions &&
            (props.rowActionsAlwaysVisible
              ? 'pr-12'
              : 'group-focus-within/session-row:pr-12 group-hover/session-row:pr-12')
        )}
      >
        {props.label}
      </span>
      {props.elapsedLabel ? (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 right-3 min-w-8 -translate-y-1/2 text-right text-xs leading-4 text-muted-foreground tabular-nums',
            elapsedHiddenClass
          )}
        >
          {props.elapsedLabel}
        </span>
      ) : null}
    </span>
  );
}

function WorkerSessionRowActions(props: {
  alwaysVisible?: boolean;
  isPinned?: boolean;
  label: string;
  onDelete?: () => void;
  onPinToggle?: () => void;
}) {
  if (!props.onPinToggle && !props.onDelete) {
    return null;
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5',
        props.alwaysVisible
          ? 'pointer-events-auto'
          : 'opacity-0 transition-opacity group-focus-within/session-row:pointer-events-auto group-focus-within/session-row:opacity-100 group-hover/session-row:pointer-events-auto group-hover/session-row:opacity-100'
      )}
    >
      {props.onPinToggle ? (
        <WorkerSessionRowIconButton
          aria-label={
            props.isPinned ? `Unpin ${props.label}` : `Pin ${props.label}`
          }
          onClick={props.onPinToggle}
        >
          {props.isPinned ? (
            <PinOffIcon aria-hidden="true" />
          ) : (
            <PinIcon aria-hidden="true" />
          )}
        </WorkerSessionRowIconButton>
      ) : null}
      {props.onDelete ? (
        <WorkerSessionRowIconButton
          aria-label={`Stop ${props.label}`}
          onClick={props.onDelete}
        >
          <Trash2Icon aria-hidden="true" />
        </WorkerSessionRowIconButton>
      ) : null}
    </div>
  );
}

function WorkerSessionRowIconButton(props: {
  'aria-label': string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props['aria-label']}
      className="flex size-5 items-center justify-center rounded-sm text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-3.5"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

function getRowScopedActionClassName(forceVisible?: boolean) {
  return forceVisible
    ? rowScopedActionDevtoolClassName
    : rowScopedActionClassName;
}

function getPinnedTerminalSessionActionLabel(
  session: PinnedTerminalSessionItem
) {
  if (session.kind === 'worker') {
    return `Open ${session.label} terminal`;
  }

  return `Open ${session.label} orchestrator terminal`;
}

function getPinnedTerminalSessions(props: {
  orchestrators: WorkerSession[];
  pinnedTerminalSessionKeys: string[];
  projects: ProjectOrchestrator[];
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const terminalSessionsByKey = new Map<string, PinnedTerminalSessionItem>();
  const pinnedTerminalSessionKeys = new Set(props.pinnedTerminalSessionKeys);
  const projectNames = new Map(
    props.projects.map((project) => [project.id, project.name])
  );

  for (const orchestrator of props.orchestrators) {
    const selectionKey = getWorkerSessionSelectionKey(orchestrator);
    terminalSessionsByKey.set(selectionKey, {
      isPinned: pinnedTerminalSessionKeys.has(selectionKey),
      kind: 'orchestrator',
      label: projectNames.get(orchestrator.project) ?? 'Orchestrator',
      selectionKey,
    });
  }

  for (const group of props.workerSessionGroups) {
    for (const session of group.sessions) {
      terminalSessionsByKey.set(session.selectionKey, {
        elapsedLabel: session.elapsedLabel,
        isPinned: pinnedTerminalSessionKeys.has(session.selectionKey),
        kind: session.kind ?? 'worker',
        label: session.label,
        selectionKey: session.selectionKey,
      });
    }
  }

  return props.pinnedTerminalSessionKeys
    .map((selectionKey) => terminalSessionsByKey.get(selectionKey))
    .filter((session): session is PinnedTerminalSessionItem => !!session);
}
