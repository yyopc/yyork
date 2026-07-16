import { Link } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  SquareKanbanIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import {
  appShortcutCatalog,
  sidebarShortcutPreviewIds,
} from '@/lib/app-hotkeys';
import { cn } from '@/lib/tailwind/utils';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DotmCircular5 } from '@/components/ui/dotm-circular-5';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

import { ShortcutHintRow } from '@/features/home/components/molecules/app-shortcuts-dialog';
import { HistoryNavigationButtons } from '@/features/home/components/molecules/history-navigation-buttons';
import { SessionContextMenu } from '@/features/home/components/molecules/session-context-menu';
import { WorkerResponseAttentionIndicator } from '@/features/home/components/molecules/worker-response-attention-indicator';
import type { OpenWorkerSessionGroupIdsByProject } from '@/features/home/data/workspace-preferences';
import {
  ADD_PROJECT_ANCHOR_ATTR,
  type AddProjectSource,
} from '@/features/home/domain/add-project';
import {
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  type TerminalSessionKind,
  type WorkerSession,
  type WorkerSessionGroupData,
  type WorkerSessionState,
} from '@/features/home/domain/session-workspace';
import type { WorkerResponseAttention } from '@/features/home/domain/worker-response-attention';
import { ThemeSelect } from '@/features/settings/components/molecules/theme-select';

const projectSidebarScrollContextClassName =
  '[--project-sidebar-sticky-row-height:calc(var(--spacing)*7)]';
const projectStickyContextClassName = 'sticky top-0 z-20 bg-sidebar';
const workerSessionGroupStickyContextClassName =
  'sticky top-[var(--project-sidebar-sticky-row-height)] z-10 bg-sidebar px-1';

interface PinnedTerminalSessionItem {
  elapsedLabel?: string;
  id?: string;
  isPinned?: boolean;
  kind?: TerminalSessionKind;
  label: string;
  responseAttention?: WorkerResponseAttention;
  selectionKey: string;
  state?: WorkerSessionState;
  titlePending?: boolean;
}

export function ProjectOrchestratorSidebar(props: {
  activeBoardProjectId?: string;
  onAddProject?: (source?: AddProjectSource) => void | Promise<void>;
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onProjectBoardSelect: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectIdeOpen?: (project: ProjectOrchestrator) => void;
  onProjectPinToggle?: (projectId: string) => void;
  onProjectOpenChange: (projectId: string, open: boolean) => void;
  onProjectRename?: (projectId: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
  onWorkerSessionGroupOpenChange: (
    projectId: string,
    groupId: WorkerSessionState,
    open: boolean
  ) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  pinnedProjectIds?: string[];
  pinnedTerminalSessionKeys?: string[];
  openProjectIds?: string[];
  openWorkerSessionGroupIdsByProject?: OpenWorkerSessionGroupIdsByProject;
  orchestrators: WorkerSession[];
  projects: ProjectOrchestrator[];
  selectedProjectId: string;
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
  workerSessionGroups: WorkerSessionGroupData[];
}) {
  const pinnedProjectIds = props.pinnedProjectIds ?? [];
  const pinnedTerminalSessionKeys = props.pinnedTerminalSessionKeys ?? [];
  const { isMobile, state } = useSidebar();
  const offcanvasContentHidden = !isMobile && state === 'collapsed';

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeaderToolbar />

      <SidebarContent
        aria-hidden={offcanvasContentHidden}
        inert={offcanvasContentHidden}
        className="gap-3 overflow-hidden p-3"
      >
        <PinnedSidebarGroup
          onOrchestratorSessionSelect={props.onOrchestratorSessionSelect}
          onProjectOpenChange={props.onProjectOpenChange}
          onProjectPinToggle={props.onProjectPinToggle}
          onTerminalSessionDelete={props.onTerminalSessionDelete}
          onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
          onTerminalSessionOpenDetached={props.onTerminalSessionOpenDetached}
          onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
          onTerminalSessionRename={props.onTerminalSessionRename}
          onTerminalSessionRestart={props.onTerminalSessionRestart}
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
          className="min-h-0 flex-1 gap-1 overflow-hidden px-0"
          aria-label="Projects"
        >
          <div className="flex h-5 shrink-0 items-center justify-between px-1">
            <SidebarGroupLabel className="h-auto px-0 text-xs leading-4 font-medium opacity-60">
              Projects
            </SidebarGroupLabel>
            <ActionTooltip
              label="Add project"
              trigger={
                <SidebarGroupAction
                  render={
                    <button
                      type="button"
                      aria-label="Add project"
                      {...{ [ADD_PROJECT_ANCHOR_ATTR]: 'sidebar' }}
                      onClick={(event) => {
                        void props.onAddProject?.({
                          anchorEl: event.currentTarget,
                        });
                      }}
                    />
                  }
                  aria-label="Add project"
                  className="static top-auto right-auto size-5 shrink-0 rounded-sm"
                />
              }
            >
              <PlusIcon aria-hidden="true" />
            </ActionTooltip>
          </div>
          <SidebarGroupContent
            className={cn(
              'min-h-0 flex-1 scroll-fade-y overflow-y-auto [--scroll-fade-reveal:calc(var(--spacing)*6)] scroll-fade-6',
              projectSidebarScrollContextClassName
            )}
          >
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
                  onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
                  onTerminalSessionOpenDetached={
                    props.onTerminalSessionOpenDetached
                  }
                  onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
                  onTerminalSessionRename={props.onTerminalSessionRename}
                  onTerminalSessionRestart={props.onTerminalSessionRestart}
                  selectedTerminalSessionKey={props.selectedTerminalSessionKey}
                  orchestrators={props.orchestrators}
                  onOrchestratorSessionSelect={
                    props.onOrchestratorSessionSelect
                  }
                  pinnedTerminalSessionKeys={pinnedTerminalSessionKeys}
                  openWorkerSessionGroupIds={
                    props.openWorkerSessionGroupIdsByProject?.[project.id]
                  }
                  onWorkerSessionGroupOpenChange={(groupId, open) =>
                    props.onWorkerSessionGroupOpenChange(
                      project.id,
                      groupId,
                      open
                    )
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

        <AppShortcutHints />
      </SidebarContent>

      <SidebarFooter
        aria-hidden={offcanvasContentHidden}
        inert={offcanvasContentHidden}
        className="border-t border-sidebar-border p-3"
      >
        <SidebarMenu className="min-w-0">
          <SidebarMenuItem>
            <SettingsMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail
        aria-hidden={offcanvasContentHidden}
        inert={offcanvasContentHidden}
      />
    </Sidebar>
  );
}

function PinnedSidebarGroup(props: {
  onOrchestratorSessionSelect: (selectionKey: string) => void;
  onProjectOpenChange: (projectId: string, open: boolean) => void;
  onProjectPinToggle?: (projectId: string) => void;
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
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
    <SidebarGroup
      role="navigation"
      className="shrink-0 gap-1 px-0"
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
              <SidebarMenuButton
                render={
                  <button type="button" aria-label={`Open ${project.name}`} />
                }
                className="h-7 rounded-sm pr-3 text-sm leading-5"
                onClick={() => props.onProjectOpenChange(project.id, true)}
              >
                <FolderIcon aria-hidden="true" />
                <span>{project.name}</span>
              </SidebarMenuButton>
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
              onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
              onTerminalSessionOpenDetached={
                props.onTerminalSessionOpenDetached
              }
              onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
              onTerminalSessionRename={props.onTerminalSessionRename}
              onTerminalSessionRestart={props.onTerminalSessionRestart}
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
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  selectedTerminalSessionKey?: string;
  session: PinnedTerminalSessionItem;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  const { session } = props;
  const actionLabel = getPinnedTerminalSessionActionLabel(session);
  const actionAriaLabel = getSessionOpenAriaLabel(
    actionLabel,
    session.responseAttention
  );
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
        onOpenDetached={
          props.onTerminalSessionOpenDetached
            ? () => props.onTerminalSessionOpenDetached?.(session.selectionKey)
            : undefined
        }
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
        onMarkDone={
          props.onTerminalSessionMarkDone &&
          session.kind === 'worker' &&
          session.state === 'prompt'
            ? () =>
                props.onTerminalSessionMarkDone?.(
                  session.selectionKey,
                  session.label
                )
            : undefined
        }
        onRestart={
          props.onTerminalSessionRestart
            ? () =>
                props.onTerminalSessionRestart?.(
                  session.selectionKey,
                  session.label
                )
            : undefined
        }
      >
        <ActionTooltip
          label={actionLabel}
          trigger={
            <SidebarMenuButton
              render={<button type="button" aria-label={actionAriaLabel} />}
              isActive={
                session.selectionKey === props.selectedTerminalSessionKey
              }
              size="sm"
              className="h-7 rounded-sm pe-3! font-normal text-muted-foreground hover:text-foreground active:text-foreground data-active:text-foreground [&>span:last-child]:pe-0!"
              onClick={openSession}
            />
          }
        >
          <WorkerSessionNavLabel
            elapsedLabel={session.elapsedLabel}
            hasRowActions={true}
            label={session.label}
            rowActionsAlwaysVisible={props.tooltipDevtoolActionsVisible}
            titlePending={session.titlePending}
            responseAttention={session.responseAttention}
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

function SettingsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            render={<button type="button" aria-label="Settings" />}
            className="h-9 rounded-sm border border-sidebar-border bg-sidebar text-sm leading-5 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
          />
        }
      >
        <SettingsIcon aria-hidden="true" />
        <span>Settings</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-(--anchor-width) min-w-(--anchor-width)"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link data-testid="settings-menu-link" to="/settings" />}
          >
            <SettingsIcon aria-hidden="true" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <div className="px-1 pb-1">
            <ThemeSelect />
          </div>
        </DropdownMenuGroup>
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
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground shadow-none"
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
  const sidebarKbdClassName =
    'bg-sidebar-accent text-sidebar-accent-foreground';
  const previewShortcuts = sidebarShortcutPreviewIds.map((id) =>
    appShortcutCatalog.find((shortcut) => shortcut.id === id)
  );

  return (
    <SidebarGroup className="shrink-0 gap-1 px-0" aria-label="App shortcuts">
      <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
        Shortcuts
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="flex min-w-0 flex-col gap-1 px-1 text-xs leading-4 text-sidebar-foreground/70">
          {previewShortcuts.map((shortcut) =>
            shortcut ? (
              <ShortcutHintRow
                key={shortcut.id}
                className="h-6 gap-2 text-xs leading-4 text-sidebar-foreground/70"
                label={shortcut.label}
                hotkeys={shortcut.hotkeys}
                kbdClassName={sidebarKbdClassName}
              />
            ) : null
          )}
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
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
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
  const projectActionProps: ProjectActionMenuProps = {
    onDelete: () => props.onProjectDelete?.(props.project.id),
    onOpenKanban: () => props.onProjectBoardSelect(props.project.id),
    onOpenProject: () => props.onProjectIdeOpen?.(props.project),
    onRename: () => props.onProjectRename?.(props.project.id),
    projectCwd: props.project.cwd,
  };

  return (
    <SidebarMenuItem>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <ProjectContextMenu {...projectActionProps}>
          <div
            data-sidebar-sticky-context="project"
            className={cn(
              'relative flex min-w-0 items-center',
              projectStickyContextClassName
            )}
          >
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
            >
              <span>{props.project.name}</span>
            </SidebarMenuButton>
            <ProjectActionsMenu
              {...projectActionProps}
              projectName={props.project.name}
            />
          </div>
        </ProjectContextMenu>
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
            onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
            onTerminalSessionOpenDetached={props.onTerminalSessionOpenDetached}
            onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
            onTerminalSessionRename={props.onTerminalSessionRename}
            onTerminalSessionRestart={props.onTerminalSessionRestart}
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
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
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
              onOpenDetached={
                props.onTerminalSessionOpenDetached
                  ? () => props.onTerminalSessionOpenDetached?.(selectionKey)
                  : undefined
              }
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
              onRestart={
                props.onTerminalSessionRestart
                  ? () =>
                      props.onTerminalSessionRestart?.(
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
                    className="h-7 w-full ps-10 pe-3! font-normal text-muted-foreground hover:text-foreground active:text-foreground data-active:text-foreground [&>span:last-child]:pe-0!"
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
          onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
          onTerminalSessionOpenDetached={props.onTerminalSessionOpenDetached}
          onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
          onTerminalSessionRename={props.onTerminalSessionRename}
          onTerminalSessionRestart={props.onTerminalSessionRestart}
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
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  open: boolean;
  pinnedTerminalSessionKeys: string[];
  selectedTerminalSessionKey?: string;
  tooltipDevtoolActionsVisible?: boolean;
}) {
  return (
    <SidebarMenuItem>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <div
          data-sidebar-sticky-context="worker-group"
          className={cn('relative', workerSessionGroupStickyContextClassName)}
        >
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
        </div>
        <CollapsibleContent className="pt-1">
          <ul className="flex w-full min-w-0 flex-col gap-1 py-0.5">
            {props.group.sessions.map((session) => {
              const sessionLabel = session.label;
              const sessionOpenTooltipLabel = getWorkerSessionOpenTooltipLabel(
                session.id
              );
              const sessionOpenAriaLabel = getSessionOpenAriaLabel(
                `Open ${sessionLabel} terminal`,
                session.responseAttention
              );

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
                    onOpenDetached={
                      props.onTerminalSessionOpenDetached
                        ? () =>
                            props.onTerminalSessionOpenDetached?.(
                              session.selectionKey
                            )
                        : undefined
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
                    onMarkDone={
                      props.onTerminalSessionMarkDone &&
                      props.group.id === 'prompt'
                        ? () =>
                            props.onTerminalSessionMarkDone?.(
                              session.selectionKey,
                              sessionLabel
                            )
                        : undefined
                    }
                    onRestart={
                      props.onTerminalSessionRestart
                        ? () =>
                            props.onTerminalSessionRestart?.(
                              session.selectionKey,
                              sessionLabel
                            )
                        : undefined
                    }
                  >
                    <ActionTooltip
                      label={sessionOpenTooltipLabel}
                      trigger={
                        <SidebarMenuButton
                          render={
                            <button
                              type="button"
                              aria-label={sessionOpenAriaLabel}
                            />
                          }
                          isActive={
                            session.selectionKey ===
                            props.selectedTerminalSessionKey
                          }
                          size="sm"
                          className="h-7 w-full ps-16 pe-3! font-normal text-muted-foreground hover:text-foreground active:text-foreground data-active:text-foreground [&>span:last-child]:pe-0!"
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
                        titlePending={session.titlePending}
                        responseAttention={session.responseAttention}
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

interface ProjectActionMenuProps {
  onDelete: () => void;
  onOpenKanban: () => void;
  onOpenProject: () => void;
  onRename: () => void;
  projectCwd?: string;
}

type ProjectActionMenuEntry =
  | {
      disabled?: boolean;
      icon: ReactElement;
      key: string;
      label: string;
      onClick: () => void;
      type: 'item';
      variant?: 'default' | 'destructive';
    }
  | {
      key: string;
      type: 'separator';
    };

function getProjectActionMenuEntries(
  props: ProjectActionMenuProps
): ProjectActionMenuEntry[] {
  return [
    {
      disabled: !props.projectCwd,
      icon: <FolderOpenIcon aria-hidden="true" />,
      key: 'open-project',
      label: 'Open project',
      onClick: props.onOpenProject,
      type: 'item',
    },
    {
      icon: <SquareKanbanIcon aria-hidden="true" />,
      key: 'open-kanban',
      label: 'Open Kanban',
      onClick: props.onOpenKanban,
      type: 'item',
    },
    {
      icon: <PencilIcon aria-hidden="true" />,
      key: 'rename-project',
      label: 'Rename project',
      onClick: props.onRename,
      type: 'item',
    },
    {
      key: 'project-danger-separator',
      type: 'separator',
    },
    {
      icon: <Trash2Icon aria-hidden="true" />,
      key: 'remove-project',
      label: 'Remove project',
      onClick: props.onDelete,
      type: 'item',
      variant: 'destructive',
    },
  ];
}

function ProjectContextMenu(
  props: ProjectActionMenuProps & {
    children: ReactNode;
  }
) {
  const entries = getProjectActionMenuEntries(props);

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents" />}>
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent align="start" side="right" className="min-w-44">
        <ContextMenuGroup>
          {entries.map((entry) =>
            entry.type === 'separator' ? (
              <ContextMenuSeparator key={entry.key} />
            ) : (
              <ContextMenuItem
                key={entry.key}
                disabled={entry.disabled}
                onClick={entry.onClick}
                variant={entry.variant}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </ContextMenuItem>
            )
          )}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProjectActionsMenu(
  props: ProjectActionMenuProps & {
    projectName: string;
  }
) {
  const entries = getProjectActionMenuEntries(props);

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
                  getRowScopedActionClassName(true),
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
          {entries.map((entry) =>
            entry.type === 'separator' ? (
              <DropdownMenuSeparator key={entry.key} />
            ) : (
              <DropdownMenuItem
                key={entry.key}
                disabled={entry.disabled}
                onClick={entry.onClick}
                variant={entry.variant}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  responseAttention?: WorkerResponseAttention;
  titlePending?: boolean;
}) {
  const elapsedHiddenClass = props.hasRowActions
    ? props.rowActionsAlwaysVisible
      ? 'hidden'
      : 'group-hover/session-row:hidden group-focus-within/session-row:hidden'
    : undefined;

  return (
    <span className="flex w-full min-w-0 flex-1 items-center gap-2">
      {props.titlePending ? (
        <DotmCircular5
          animated
          ariaLabel="Generating session title"
          className="size-4 shrink-0 text-foreground"
          dotSize={2}
          size={16}
        />
      ) : null}
      <WorkerResponseAttentionIndicator
        attention={props.responseAttention}
        size="sidebar"
      />
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
      className="flex size-5 items-center justify-center rounded-sm text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-3.5"
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
    return getWorkerSessionOpenTooltipLabel(session.id ?? session.selectionKey);
  }

  return `Open ${session.label} orchestrator terminal`;
}

function getWorkerSessionOpenTooltipLabel(sessionId: string) {
  return `open the worker session: ${sessionId}`;
}

function getSessionOpenAriaLabel(
  baseLabel: string,
  attention: WorkerResponseAttention | undefined
) {
  return attention ? `${baseLabel}. ${attention.label}` : baseLabel;
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
        id: session.id,
        isPinned: pinnedTerminalSessionKeys.has(session.selectionKey),
        kind: session.kind ?? 'worker',
        label: session.label,
        responseAttention: session.responseAttention,
        selectionKey: session.selectionKey,
        state: session.state,
        titlePending: session.titlePending,
      });
    }
  }

  return props.pinnedTerminalSessionKeys
    .map((selectionKey) => terminalSessionsByKey.get(selectionKey))
    .filter((session): session is PinnedTerminalSessionItem => !!session);
}
