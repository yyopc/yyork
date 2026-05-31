import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
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

import {
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  type TerminalSessionKind,
  type WorkerSession,
  type WorkerSessionGroupData,
  type WorkerSessionState,
} from '@/features/home/domain/session-workspace';

const bracketedWorkerIdPattern = /^\[(.*)\]$/;
const themeOptions = [
  { icon: SunMoonIcon, label: 'System', value: 'system' },
  { icon: SunIcon, label: 'Light', value: 'light' },
  { icon: MoonIcon, label: 'Dark', value: 'dark' },
] as const;

interface PinnedTerminalSessionItem {
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
  sessionLabelOverrides?: Record<string, string>;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const pinnedProjectIds = props.pinnedProjectIds ?? [];
  const pinnedTerminalSessionKeys = props.pinnedTerminalSessionKeys ?? [];
  const pinnedProjects = props.projects.filter((project) =>
    pinnedProjectIds.includes(project.id)
  );
  const pinnedTerminalSessions = getPinnedTerminalSessions({
    orchestrators: props.orchestrators,
    pinnedTerminalSessionKeys,
    projects: props.projects,
    sessionLabelOverrides: props.sessionLabelOverrides,
    workerSessionGroups: props.workerSessionGroups,
  });

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-15 shrink-0 items-start justify-center gap-0 border-b border-sidebar-border p-0 pr-3">
        <SidebarToggleButton />
      </SidebarHeader>

      <SidebarContent className="gap-3 overflow-hidden p-3">
        <SidebarGroup
          role="navigation"
          className="gap-1 px-0"
          aria-label="Pinned"
        >
          <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
            Pinned
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="min-w-0">
              {pinnedProjects.length === 0 &&
              pinnedTerminalSessions.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<button type="button" disabled />}
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
                        render={<button type="button" />}
                        className="h-7 rounded-sm pr-3 text-sm leading-5"
                        onClick={() =>
                          props.onProjectOpenChange(project.id, true)
                        }
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
              {pinnedTerminalSessions.map((session) => {
                const openSession = () => {
                  if (session.kind === 'worker') {
                    props.onWorkerSessionSelect(session.selectionKey);
                    return;
                  }

                  props.onOrchestratorSessionSelect(session.selectionKey);
                };

                return (
                  <SidebarMenuItem key={session.selectionKey}>
                    <SessionContextMenu
                      label={session.label}
                      onOpen={openSession}
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
                            render={<button type="button" />}
                            isActive={
                              session.selectionKey ===
                              props.selectedTerminalSessionKey
                            }
                            className="h-7 rounded-sm pr-3 text-sm leading-5 font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground"
                            onClick={openSession}
                          />
                        }
                      >
                        <span>{session.label}</span>
                      </ActionTooltip>
                      <PinToggleAction
                        isPinned={true}
                        label={`Unpin ${session.label}`}
                        onToggle={() =>
                          props.onTerminalSessionPinToggle?.(
                            session.selectionKey
                          )
                        }
                        tooltipDevtoolActionsVisible={
                          props.tooltipDevtoolActionsVisible
                        }
                      />
                    </SessionContextMenu>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup
          role="navigation"
          className="gap-1 px-0"
          aria-label="Projects"
        >
          <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
            Projects
          </SidebarGroupLabel>
          <ActionTooltip
            label="Add project"
            trigger={
              <SidebarGroupAction
                render={<button type="button" />}
                aria-label="Add project"
                className="top-0 right-0 rounded-sm"
                onClick={props.onAddProject}
              />
            }
          >
            <PlusIcon aria-hidden="true" />
          </ActionTooltip>
          <SidebarGroupContent>
            <SidebarMenu className="min-w-0">
              {props.projects.map((project) => (
                <ProjectNavItem
                  key={project.id}
                  project={project}
                  isBoardActive={project.id === props.activeBoardProjectId}
                  isProjectPinned={pinnedProjectIds.includes(project.id)}
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
                  onProjectPinToggle={props.onProjectPinToggle}
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
                  sessionLabelOverrides={props.sessionLabelOverrides}
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

function SettingsMenu(props: { onSettingsOpen?: () => void }) {
  const { setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const selectedTheme = hydrated ? theme : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            render={<button type="button" />}
            className="h-9 rounded-sm border border-sidebar-border bg-sidebar text-sm leading-5 shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
            className="fixed top-3 left-3 z-30 size-9 rounded-sm shadow-none"
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
  isProjectPinned: boolean;
  onProjectBoardSelect: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectIdeOpen?: (project: ProjectOrchestrator) => void;
  onProjectPinToggle?: (projectId: string) => void;
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
  sessionLabelOverrides?: Record<string, string>;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  return (
    <SidebarMenuItem>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <ActionTooltip
          label={
            props.open
              ? `Collapse ${props.project.name} workers`
              : `Expand ${props.project.name} workers`
          }
          trigger={
            <CollapsibleTrigger
              render={<button type="button" />}
              className="absolute top-1 left-0 z-10 flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4"
            />
          }
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={props.open ? 'rotate-90' : undefined}
          />
        </ActionTooltip>
        <ActionTooltip
          label={`Open ${props.project.name} board`}
          trigger={
            <SidebarMenuButton
              render={<button type="button" />}
              isActive={props.isBoardActive}
              className="h-9 rounded-sm ps-8 pe-3 text-sm leading-5 font-normal"
              onClick={() => props.onProjectBoardSelect(props.project.id)}
            />
          }
        >
          <span>{props.project.name}</span>
        </ActionTooltip>
        <ProjectActionsMenu
          isPinned={props.isProjectPinned}
          onDelete={() => props.onProjectDelete?.(props.project.id)}
          onOpenProject={() => props.onProjectIdeOpen?.(props.project)}
          onPinToggle={() => props.onProjectPinToggle?.(props.project.id)}
          onRename={() => props.onProjectRename?.(props.project.id)}
          projectCwd={props.project.cwd}
          projectName={props.project.name}
          tooltipDevtoolActionsVisible={props.tooltipDevtoolActionsVisible}
        />
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
            sessionLabelOverrides={props.sessionLabelOverrides}
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
  sessionLabelOverrides?: Record<string, string>;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  const projectOrchestrators = props.orchestrators.filter(
    (orchestrator) =>
      orchestrator.project === props.projectId &&
      !props.pinnedTerminalSessionKeys.includes(
        getWorkerSessionSelectionKey(orchestrator)
      )
  );
  const groupsWithSessions = props.groups
    .map((group) => ({
      ...group,
      sessions: group.sessions.filter(
        (session) =>
          session.project === props.projectId &&
          !props.pinnedTerminalSessionKeys.includes(session.selectionKey)
      ),
    }))
    .filter((group) => group.sessions.length > 0);

  if (groupsWithSessions.length === 0 && projectOrchestrators.length === 0) {
    return (
      <ul className="flex w-full min-w-0 flex-col gap-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<button type="button" disabled />}
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
        const orchestratorLabel =
          props.sessionLabelOverrides?.[selectionKey] ?? 'Orchestrator';

        return (
          <SidebarMenuItem key={selectionKey}>
            <SessionContextMenu
              label={orchestratorLabel}
              onOpen={() => props.onOrchestratorSessionSelect(selectionKey)}
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
                    render={<button type="button" />}
                    isActive={selectionKey === props.selectedTerminalSessionKey}
                    size="sm"
                    className="h-7 w-full ps-10 pr-3 font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground"
                    onClick={() =>
                      props.onOrchestratorSessionSelect(selectionKey)
                    }
                  />
                }
              >
                <span>{orchestratorLabel}</span>
              </ActionTooltip>
              <PinToggleAction
                isPinned={props.pinnedTerminalSessionKeys.includes(
                  selectionKey
                )}
                label={
                  props.pinnedTerminalSessionKeys.includes(selectionKey)
                    ? `Unpin ${orchestratorLabel}`
                    : `Pin ${orchestratorLabel}`
                }
                onToggle={() =>
                  props.onTerminalSessionPinToggle?.(selectionKey)
                }
                tooltipDevtoolActionsVisible={
                  props.tooltipDevtoolActionsVisible
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
          sessionLabelOverrides={props.sessionLabelOverrides}
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
  sessionLabelOverrides?: Record<string, string>;
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
                  render={<button type="button" />}
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
              const sessionLabel =
                props.sessionLabelOverrides?.[session.selectionKey] ??
                getWorkerSessionLabel(session.workerId);

              return (
                <SidebarMenuItem key={session.selectionKey}>
                  <SessionContextMenu
                    label={sessionLabel}
                    onOpen={() =>
                      props.onWorkerSessionSelect(session.selectionKey)
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
                          render={<button type="button" />}
                          isActive={
                            session.selectionKey ===
                            props.selectedTerminalSessionKey
                          }
                          size="sm"
                          className="h-6 w-full ps-16 pr-3 font-normal text-foreground hover:text-foreground active:text-foreground data-[active=true]:text-foreground"
                          onClick={() =>
                            props.onWorkerSessionSelect(session.selectionKey)
                          }
                        />
                      }
                    >
                      <span>{sessionLabel}</span>
                    </ActionTooltip>
                    <PinToggleAction
                      isPinned={props.pinnedTerminalSessionKeys.includes(
                        session.selectionKey
                      )}
                      label={
                        props.pinnedTerminalSessionKeys.includes(
                          session.selectionKey
                        )
                          ? `Unpin ${sessionLabel}`
                          : `Pin ${sessionLabel}`
                      }
                      onToggle={() =>
                        props.onTerminalSessionPinToggle?.(session.selectionKey)
                      }
                      tooltipDevtoolActionsVisible={
                        props.tooltipDevtoolActionsVisible
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
  isPinned: boolean;
  onDelete: () => void;
  onOpenProject: () => void;
  onPinToggle: () => void;
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
          <DropdownMenuItem onClick={props.onPinToggle}>
            {props.isPinned ? (
              <PinOffIcon aria-hidden="true" />
            ) : (
              <PinIcon aria-hidden="true" />
            )}
            <span>{props.isPinned ? 'Unpin project' : 'Pin project'}</span>
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
  label: string;
  onDelete?: () => void;
  onHide?: () => void;
  onOpen: () => void;
  onRename?: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents" />}>
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent align="start" side="right" className="min-w-44">
        <ContextMenuItem onClick={props.onOpen}>
          <SquareTerminalIcon aria-hidden="true" />
          <span>Open {props.label}</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!props.onRename} onClick={props.onRename}>
          <PencilIcon aria-hidden="true" />
          <span>Rename {props.label}</span>
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
          <span>Stop {props.label}</span>
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
  'top-2 peer-data-[size=default]/menu-button:top-2';
const pinActionColorClassName =
  'bg-transparent text-sidebar-foreground/60 peer-hover/menu-button:text-sidebar-foreground/60 hover:bg-transparent hover:text-sidebar-foreground/80 active:bg-transparent focus-visible:bg-transparent focus-visible:text-sidebar-foreground/80 data-[state=open]:bg-transparent data-[state=open]:text-sidebar-foreground/80';

function getWorkerSessionLabel(workerId: string) {
  return workerId.replace(bracketedWorkerIdPattern, '$1');
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
  sessionLabelOverrides?: Record<string, string>;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const terminalSessionsByKey = new Map<string, PinnedTerminalSessionItem>();
  const projectNames = new Map(
    props.projects.map((project) => [project.id, project.name])
  );
  const labelOverride = (selectionKey: string, fallback: string) =>
    props.sessionLabelOverrides?.[selectionKey] ?? fallback;

  for (const orchestrator of props.orchestrators) {
    const selectionKey = getWorkerSessionSelectionKey(orchestrator);
    terminalSessionsByKey.set(selectionKey, {
      kind: 'orchestrator',
      label: labelOverride(
        selectionKey,
        projectNames.get(orchestrator.project) ?? 'Orchestrator'
      ),
      selectionKey,
    });
  }

  for (const group of props.workerSessionGroups) {
    for (const session of group.sessions) {
      terminalSessionsByKey.set(session.selectionKey, {
        kind: session.kind ?? 'worker',
        label: labelOverride(
          session.selectionKey,
          getWorkerSessionLabel(session.workerId)
        ),
        selectionKey: session.selectionKey,
      });
    }
  }

  return props.pinnedTerminalSessionKeys
    .map((selectionKey) => terminalSessionsByKey.get(selectionKey))
    .filter((session): session is PinnedTerminalSessionItem => !!session);
}
