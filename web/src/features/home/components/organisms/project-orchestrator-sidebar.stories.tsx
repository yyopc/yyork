import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  FolderOpenIcon,
  KanbanSquareIcon,
  PanelRightOpenIcon,
  PinIcon,
  PlusIcon,
  RefreshCcwIcon,
  Settings2Icon,
  TerminalIcon,
  XIcon,
} from 'lucide-react';
import { type ComponentProps, type ReactNode, useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { KanbanBoard } from '@/features/home/components/organisms/kanban-board';
import { ProjectOrchestratorSidebar } from '@/features/home/components/organisms/project-orchestrator-sidebar';
import {
  demoHomeWorkspace,
  sampleWorkerSessionGroups,
} from '@/features/home/demo/session-workspace.fixtures';
import {
  getKanbanColumns,
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  type WorkerSessionGroupData,
  type WorkerSessionNavItem,
} from '@/features/home/domain/session-workspace';

const meta = {
  title: 'Home/Project Orchestrator Sidebar',
  component: ProjectOrchestratorSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-180 bg-background font-mono text-foreground">
        <SidebarProvider className="[--sidebar-width:13rem]">
          <Story />
        </SidebarProvider>
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectOrchestratorSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

const sidebarStoryArgs = {
  onOrchestratorSessionSelect: () => {},
  onProjectBoardSelect: () => {},
  onProjectDelete: () => {},
  onProjectPinToggle: () => {},
  onProjectOpenChange: () => {},
  onProjectRename: () => {},
  onTerminalSessionPinToggle: () => {},
  onWorkerSessionGroupOpenChange: () => {},
  onWorkerSessionSelect: () => {},
  orchestrators: demoHomeWorkspace.orchestrators ?? [],
  pinnedProjectIds: [],
  pinnedTerminalSessionKeys: [],
  projects: demoHomeWorkspace.projects,
  selectedProjectId: demoHomeWorkspace.activeProjectId,
  selectedTerminalSessionKey: getWorkerSessionSelectionKey({
    id: 'session-ao-2',
    project: demoHomeWorkspace.activeProjectId,
  }),
  workerSessionGroups: sampleWorkerSessionGroups,
} satisfies Story['args'];

export const WorkerSessionsNested: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Baseline: the orchestrator is a separate child row under the project. It keeps every terminal in one tree, but the row reads like another worker and does not explain why it is special.',
      },
    },
  },
  render: (args) => (
    <WorkspaceStoryLayout sidebar={<ProjectOrchestratorSidebar {...args} />}>
      <TerminalWorkspacePanel
        eyebrow="Terminal"
        title="AO-2"
        lines={[
          '$ pnpm --filter @better-ao/web dev',
          'ready in 281 ms',
          'local: http://localhost:3000',
        ]}
      />
    </WorkspaceStoryLayout>
  ),
  args: sidebarStoryArgs,
};

export const ProjectRootOwnsOrchestrator: Story = {
  args: sidebarStoryArgs,
  parameters: {
    docs: {
      description: {
        story:
          'Recommended direction: the project row is the orchestrator entry. The folder icon carries expand/collapse state, so there is no extra chevron or "Orchestrator" row to discover.',
      },
    },
  },
  render: () => {
    const activeProject = getActiveProjectFixture();

    return (
      <WorkspaceStoryLayout
        sidebar={
          <ConceptSidebarShell>
            <ProjectsGroup>
              {demoHomeWorkspace.projects.map((project) =>
                project.id === activeProject.id ? (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      render={<button type="button" />}
                      isActive={true}
                      className="h-9 rounded-none text-sm leading-5"
                      title="Open project orchestrator"
                    >
                      <FolderOpenIcon aria-hidden="true" />
                      <span>{project.name}</span>
                    </SidebarMenuButton>
                    <ProjectWorkerGroups
                      groups={getProjectWorkerGroups(project.id)}
                    />
                  </SidebarMenuItem>
                ) : (
                  <CollapsedProjectItem key={project.id} project={project} />
                )
              )}
            </ProjectsGroup>
          </ConceptSidebarShell>
        }
      >
        <TerminalWorkspacePanel
          eyebrow={activeProject.name}
          title="Project orchestrator"
          lines={[
            '$ ao status',
            'workers: 8',
            'next: route prompt sessions before opening new work',
          ]}
        />
      </WorkspaceStoryLayout>
    );
  },
};

export const SelectedSessionContextActions: Story = {
  args: sidebarStoryArgs,
  parameters: {
    docs: {
      description: {
        story:
          'No-tabs direction: project rows expose a Kanban icon action, and selecting a worker or orchestrator renders its terminal directly. Canvas is a contextual action in the selected target header, not a top-level workspace tab.',
      },
    },
  },
  render: () => <SelectedSessionContextActionsStory />,
};

const demoOrchestratorSelectionKey = getWorkerSessionSelectionKey({
  id: 'ao-orchestrator',
  project: demoHomeWorkspace.activeProjectId,
});
const demoTriageSelectionKey = getWorkerSessionSelectionKey({
  id: 'session-ao-8',
  project: demoHomeWorkspace.activeProjectId,
});
const demoPromptSelectionKey = getWorkerSessionSelectionKey({
  id: 'session-ao-3',
  project: demoHomeWorkspace.activeProjectId,
});

export const OrchestratorInTopbar: Story = {
  args: sidebarStoryArgs,
  parameters: {
    docs: {
      description: {
        story:
          'Larger layout option: remove the orchestrator from the sidebar and make it a workspace-level tab in the main topbar. The sidebar stays about projects and workers; orchestration becomes the selected mode for the open project.',
      },
    },
  },
  render: () => {
    const activeProject = getActiveProjectFixture();

    return (
      <WorkspaceStoryLayout
        sidebar={
          <ConceptSidebarShell>
            <ProjectsGroup>
              {demoHomeWorkspace.projects.map((project) =>
                project.id === activeProject.id ? (
                  <ExpandedProjectItem
                    key={project.id}
                    project={project}
                    groups={getProjectWorkerGroups(project.id)}
                  />
                ) : (
                  <CollapsedProjectItem key={project.id} project={project} />
                )
              )}
            </ProjectsGroup>
          </ConceptSidebarShell>
        }
      >
        <TopbarOrchestratorPanel projectName={activeProject.name} />
      </WorkspaceStoryLayout>
    );
  },
};

export const PinnedLeadThread: Story = {
  args: sidebarStoryArgs,
  name: 'Pinned Orchestrator',
  parameters: {
    docs: {
      description: {
        story:
          'Chosen direction: keep the orchestrator in the tree, but make it read like a pinned primary thread instead of a generic separate button. It stays named "Orchestrator" because that is the product concept users already recognize.',
      },
    },
  },
  render: () => {
    const activeProject = getActiveProjectFixture();

    return (
      <WorkspaceStoryLayout
        sidebar={
          <ConceptSidebarShell>
            <ProjectsGroup>
              {demoHomeWorkspace.projects.map((project) =>
                project.id === activeProject.id ? (
                  <ExpandedProjectItem
                    key={project.id}
                    project={project}
                    groups={getProjectWorkerGroups(project.id)}
                    pinnedOrchestrator={true}
                  />
                ) : (
                  <CollapsedProjectItem key={project.id} project={project} />
                )
              )}
            </ProjectsGroup>
          </ConceptSidebarShell>
        }
      >
        <TerminalWorkspacePanel
          eyebrow={activeProject.name}
          title="Orchestrator"
          lines={[
            '$ ao assign --from-orchestrator',
            'triage: AO-5 AO-6 AO-7 AO-8',
            'prompt: AO-3 AO-4',
          ]}
        />
      </WorkspaceStoryLayout>
    );
  },
};

export const PinnedSessionsSection: Story = {
  args: sidebarStoryArgs,
  parameters: {
    docs: {
      description: {
        story:
          'Chosen direction: pinned projects and pinned sessions live in a dedicated sidebar section. Session rows reveal a pin action on hover/focus; project rows expose pin, rename, and delete from the three-dot menu.',
      },
    },
  },
  render: () => <PinnedSessionsSectionStory />,
};

export const TemporaryTooltipDevtool: Story = {
  args: {
    ...sidebarStoryArgs,
    openProjectIds: demoHomeWorkspace.projects.map((project) => project.id),
    openWorkerSessionGroupIds: sampleWorkerSessionGroups.map(
      (group) => group.id
    ),
    pinnedProjectIds: ['ao-tui'],
    pinnedTerminalSessionKeys: [
      demoOrchestratorSelectionKey,
      demoPromptSelectionKey,
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Temporary review-only story: use the floating control to force every sidebar action tooltip open at once.',
      },
    },
  },
  render: (args) => <TemporaryTooltipDevtoolStory {...args} />,
};

function WorkspaceStoryLayout(props: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <>
      {props.sidebar}
      <SidebarInset>
        <main className="flex h-full flex-col border-l border-border bg-background">
          {props.children}
        </main>
      </SidebarInset>
    </>
  );
}

function ConceptSidebarShell(props: { children: ReactNode }) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-15 shrink-0 justify-center gap-0 border-b border-sidebar-border p-0 px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-base leading-6 font-bold text-sidebar-foreground">
            better-ao
          </h1>
          <span className="rounded-full border border-sidebar-border bg-sidebar-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-sidebar-primary-foreground">
            alpha
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-3 overflow-hidden p-3">
        {props.children}
        <div className="hidden min-h-0 flex-1 md:block" />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu className="min-w-0">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    render={<button type="button" />}
                    className="h-9 rounded-sm border border-sidebar-border bg-sidebar text-sm leading-5 shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                    <span>Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-36">
                    <DropdownMenuItem>System</DropdownMenuItem>
                    <DropdownMenuItem>Light</DropdownMenuItem>
                    <DropdownMenuItem>Dark</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function ProjectsGroup(props: { children: ReactNode }) {
  return (
    <SidebarGroup
      role="navigation"
      className="gap-1 px-0"
      aria-label="Projects"
    >
      <SidebarGroupLabel className="h-5 px-1 text-xs leading-4 font-medium opacity-60">
        Projects
      </SidebarGroupLabel>
      <SidebarGroupAction
        render={<button type="button" />}
        aria-label="Add project"
        title="Add project"
        className="top-0 right-0"
      >
        <PlusIcon aria-hidden="true" />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu className="min-w-0">{props.children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function CollapsedProjectItem(props: {
  isKanbanActive?: boolean;
  onKanbanSelect?: () => void;
  project: ProjectOrchestrator;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<button type="button" />}
        className={cn(
          'h-9 rounded-none text-sm leading-5',
          props.onKanbanSelect && 'pe-8'
        )}
      >
        <FolderIcon aria-hidden="true" />
        <span>{props.project.name}</span>
      </SidebarMenuButton>
      {props.onKanbanSelect ? (
        <ProjectKanbanAction
          isActive={props.isKanbanActive ?? false}
          projectName={props.project.name}
          onSelect={props.onKanbanSelect}
        />
      ) : null}
    </SidebarMenuItem>
  );
}

function ExpandedProjectItem(props: {
  groups: WorkerSessionGroupData[];
  pinnedOrchestrator?: boolean;
  project: ProjectOrchestrator;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<button type="button" />}
        className="h-9 rounded-none text-sm leading-5"
      >
        <FolderOpenIcon aria-hidden="true" />
        <span>{props.project.name}</span>
      </SidebarMenuButton>
      {props.pinnedOrchestrator ? (
        <ul className="flex min-w-0 flex-col gap-0">
          <PinnedOrchestratorButton />
        </ul>
      ) : null}
      <ProjectWorkerGroups groups={props.groups} />
    </SidebarMenuItem>
  );
}

function PinnedOrchestratorButton() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<button type="button" />}
        isActive={true}
        size="sm"
        className="h-7 w-full ps-9 pe-2 font-medium text-sidebar-foreground"
      >
        <PinIcon aria-hidden="true" />
        <span>Orchestrator</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectWorkerGroups(props: {
  groups: WorkerSessionGroupData[];
  onSessionSelect?: (selectionKey: string) => void;
  selectedKey?: string;
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-0">
      {props.groups.map((group) => (
        <SidebarMenuItem key={group.id}>
          <SidebarMenuButton
            render={<button type="button" />}
            size="sm"
            className="h-7 w-full ps-9 pe-2 font-bold text-sidebar-foreground/80"
          >
            <ChevronDownIcon aria-hidden="true" />
            <span>{group.label}</span>
          </SidebarMenuButton>
          <ul className="flex min-w-0 flex-col gap-0 py-0.5">
            {group.sessions.map((session) => (
              <WorkerSessionButton
                key={session.selectionKey}
                onSessionSelect={props.onSessionSelect}
                session={session}
                selectedKey={props.selectedKey}
              />
            ))}
          </ul>
        </SidebarMenuItem>
      ))}
    </ul>
  );
}

function WorkerSessionButton(props: {
  onSessionSelect?: (selectionKey: string) => void;
  selectedKey?: string;
  session: WorkerSessionNavItem;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<button type="button" />}
        isActive={props.session.selectionKey === props.selectedKey}
        size="sm"
        className="h-6 w-full ps-16 pe-2"
        onClick={() => props.onSessionSelect?.(props.session.selectionKey)}
      >
        <span>{getWorkerSessionLabel(props.session.workerId)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function TopbarOrchestratorPanel(props: { projectName: string }) {
  return (
    <>
      <div className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-5 font-medium">
            {props.projectName}
          </p>
        </div>
        <Tabs
          aria-label="Workspace mode"
          className="shrink-0"
          value="orchestrator"
        >
          <TabsList className="h-9 w-[312px] overflow-hidden rounded-none border border-border bg-background p-0 text-foreground">
            {[
              {
                label: 'Orchestrator',
                value: 'orchestrator',
                width: 'w-[136px]',
              },
              { label: 'AO-8', value: 'worker', width: 'w-20' },
              { label: 'Board', value: 'board', width: 'w-24' },
            ].map((tab, index, tabs) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'h-9 shrink-0 rounded-none border-0 px-3 text-sm leading-5 font-medium data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground',
                  tab.width,
                  index < tabs.length - 1 && 'border-r border-border'
                )}
              >
                {tab.value === 'orchestrator' ? (
                  <TerminalIcon aria-hidden="true" data-icon="inline-start" />
                ) : null}
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <TerminalWorkspacePanel
        eyebrow={props.projectName}
        title="Project orchestrator"
        lines={[
          '$ ao watch --project agent-orchestrator',
          'active: orchestrator',
          'visible workers: prompt 2, triage 4, working 2',
        ]}
      />
    </>
  );
}

interface SelectedTargetWorkspaceModel {
  agent: string;
  cwd: string;
  eyebrow: string;
  lines: string[];
  metadata: string;
  previewUrl: string;
  title: string;
}

type SelectedWorkspaceDestination =
  | {
      kind: 'kanban';
      projectId: string;
    }
  | {
      kind: 'session';
      selectionKey: string;
    };

function SelectedSessionContextActionsStory() {
  const [destination, setDestination] = useState<SelectedWorkspaceDestination>({
    kind: 'session',
    selectionKey: demoTriageSelectionKey,
  });
  const selectedTerminalSessionKey =
    destination.kind === 'session' ? destination.selectionKey : undefined;
  const target =
    destination.kind === 'session'
      ? getSelectedTargetWorkspaceModel(destination.selectionKey)
      : undefined;

  return (
    <WorkspaceStoryLayout
      sidebar={
        <KanbanDestinationSidebar
          destination={destination}
          onDestinationChange={setDestination}
          selectedTerminalSessionKey={selectedTerminalSessionKey}
        />
      }
    >
      {destination.kind === 'kanban' ? (
        <ProjectBoardWorkspacePanel
          onSessionSelect={(selectionKey) =>
            setDestination({ kind: 'session', selectionKey })
          }
          projectId={destination.projectId}
        />
      ) : target ? (
        <SelectedTargetWorkspacePanel target={target} />
      ) : null}
    </WorkspaceStoryLayout>
  );
}

function KanbanDestinationSidebar(props: {
  destination: SelectedWorkspaceDestination;
  onDestinationChange: (destination: SelectedWorkspaceDestination) => void;
  selectedTerminalSessionKey?: string;
}) {
  const activeProject = getActiveProjectFixture();

  return (
    <ConceptSidebarShell>
      <ProjectsGroup>
        {demoHomeWorkspace.projects.map((project) =>
          project.id === activeProject.id ? (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton
                render={<button type="button" />}
                className="h-9 rounded-none pe-8 text-sm leading-5"
                title="Active project"
              >
                <FolderOpenIcon aria-hidden="true" />
                <span>{project.name}</span>
              </SidebarMenuButton>
              <ProjectKanbanAction
                isActive={
                  props.destination.kind === 'kanban' &&
                  props.destination.projectId === project.id
                }
                projectName={project.name}
                onSelect={() =>
                  props.onDestinationChange({
                    kind: 'kanban',
                    projectId: project.id,
                  })
                }
              />
              <ul className="flex min-w-0 flex-col gap-0">
                <ProjectOrchestratorDestinationButton
                  projectId={project.id}
                  selectedTerminalSessionKey={props.selectedTerminalSessionKey}
                  onSelect={(selectionKey) =>
                    props.onDestinationChange({ kind: 'session', selectionKey })
                  }
                />
              </ul>
              <ProjectWorkerGroups
                groups={getProjectWorkerGroups(project.id)}
                selectedKey={props.selectedTerminalSessionKey}
                onSessionSelect={(selectionKey) =>
                  props.onDestinationChange({ kind: 'session', selectionKey })
                }
              />
            </SidebarMenuItem>
          ) : (
            <CollapsedProjectItem
              key={project.id}
              project={project}
              isKanbanActive={
                props.destination.kind === 'kanban' &&
                props.destination.projectId === project.id
              }
              onKanbanSelect={() =>
                props.onDestinationChange({
                  kind: 'kanban',
                  projectId: project.id,
                })
              }
            />
          )
        )}
      </ProjectsGroup>
    </ConceptSidebarShell>
  );
}

function ProjectKanbanAction(props: {
  isActive: boolean;
  projectName: string;
  onSelect: () => void;
}) {
  return (
    <SidebarMenuAction
      render={
        <button
          type="button"
          aria-label={`Open ${props.projectName} Kanban`}
          aria-pressed={props.isActive}
          title={`Open ${props.projectName} Kanban`}
        />
      }
      className="top-2"
      onClick={props.onSelect}
    >
      <KanbanSquareIcon aria-hidden="true" />
    </SidebarMenuAction>
  );
}

function ProjectOrchestratorDestinationButton(props: {
  onSelect: (selectionKey: string) => void;
  projectId: string;
  selectedTerminalSessionKey?: string;
}) {
  const orchestrator = (demoHomeWorkspace.orchestrators ?? []).find(
    (candidate) => candidate.project === props.projectId
  );

  if (!orchestrator) {
    return null;
  }

  const selectionKey = getWorkerSessionSelectionKey(orchestrator);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<button type="button" />}
        isActive={selectionKey === props.selectedTerminalSessionKey}
        size="sm"
        className="h-7 w-full ps-9 pe-2 font-medium text-sidebar-foreground"
        onClick={() => props.onSelect(selectionKey)}
      >
        <TerminalIcon aria-hidden="true" />
        <span>Orchestrator</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectBoardWorkspacePanel(props: {
  onSessionSelect: (selectionKey: string) => void;
  projectId: string;
}) {
  const project = getStoryProject(props.projectId);
  const projectKanbanColumns = getKanbanColumns(
    demoHomeWorkspace.sessions.filter(
      (session) => session.project === props.projectId
    )
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs leading-4 font-medium text-muted-foreground">
            {project.name} / project
          </p>
          <h2 className="truncate text-lg leading-7 font-semibold">
            Kanban board
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-none"
          aria-label="Refresh board"
          title="Refresh board"
        >
          <RefreshCcwIcon aria-hidden="true" />
        </Button>
      </header>
      <KanbanBoard
        className="flex-1"
        columns={projectKanbanColumns}
        onSessionSelect={props.onSessionSelect}
      />
    </div>
  );
}

function SelectedTargetWorkspacePanel(props: {
  target: SelectedTargetWorkspaceModel;
}) {
  const [canvasOpen, setCanvasOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs leading-4 font-medium text-muted-foreground">
            {props.target.eyebrow}
          </p>
          <h2 className="truncate text-lg leading-7 font-semibold">
            {props.target.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={canvasOpen ? 'default' : 'secondary'}
            size="sm"
            className="rounded-none"
            aria-pressed={canvasOpen}
            onClick={() => setCanvasOpen(true)}
          >
            <PanelRightOpenIcon aria-hidden="true" data-icon="inline-start" />
            <span>Canvas</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            aria-label="Refresh terminal"
            title="Refresh terminal"
          >
            <RefreshCcwIcon aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          aria-label={`${props.target.title} terminal`}
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
        >
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4 text-xs leading-4 text-muted-foreground">
            <TerminalIcon aria-hidden="true" className="size-4" />
            <span className="truncate">{props.target.cwd}</span>
          </div>
          <div className="min-h-0 flex-1 bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
            {props.target.lines.map((line) => (
              <p key={line} className="truncate">
                {line}
              </p>
            ))}
          </div>
        </section>

        {canvasOpen ? (
          <CanvasContextPanel
            target={props.target}
            onClose={() => setCanvasOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function CanvasContextPanel(props: {
  onClose: () => void;
  target: SelectedTargetWorkspaceModel;
}) {
  return (
    <aside
      aria-label="Canvas inspector"
      className="flex h-72 shrink-0 flex-col border-t border-border bg-background md:h-auto md:w-92 md:border-t-0 md:border-l"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm leading-5 font-semibold">Canvas</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-none"
          aria-label="Close Canvas"
          title="Close Canvas"
          onClick={props.onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] border-b border-border px-3 py-2 text-xs leading-5">
        <span className="text-muted-foreground">Target</span>
        <span className="truncate">{props.target.title}</span>
        <span className="text-muted-foreground">Agent</span>
        <span className="truncate">{props.target.agent}</span>
        <span className="text-muted-foreground">Metadata</span>
        <span className="truncate">{props.target.metadata}</span>
        <span className="text-muted-foreground">Preview</span>
        <span className="truncate">{props.target.previewUrl}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="grid h-full grid-rows-[auto_1fr] border border-border bg-muted/20">
          <div className="border-b border-border px-3 py-2 text-xs leading-4 font-medium">
            Worktree snapshot
          </div>
          <div className="min-h-0 overflow-hidden px-3 py-2 text-xs leading-5 text-muted-foreground">
            <p className="truncate">src/features/home/components</p>
            <p className="truncate">src/features/home/domain</p>
            <p className="truncate">prds/canvas/PRD.md</p>
            <p className="truncate text-foreground">+ 8 changed files</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TerminalWorkspacePanel(props: {
  eyebrow: string;
  lines: string[];
  title: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-xs leading-4 font-medium text-muted-foreground">
          {props.eyebrow}
        </p>
        <h2 className="truncate text-lg leading-7 font-semibold">
          {props.title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
        {props.lines.map((line) => (
          <p key={line} className="truncate">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function getActiveProjectFixture() {
  const activeProject =
    demoHomeWorkspace.projects.find(
      (project) => project.id === demoHomeWorkspace.activeProjectId
    ) ?? demoHomeWorkspace.projects[0];

  if (!activeProject) {
    throw new Error('Demo workspace must include at least one project.');
  }

  return activeProject;
}

function getStoryProject(projectId: string) {
  return (
    demoHomeWorkspace.projects.find((project) => project.id === projectId) ??
    getActiveProjectFixture()
  );
}

function getProjectWorkerGroups(projectId: string) {
  return sampleWorkerSessionGroups
    .map((group) => ({
      ...group,
      sessions: group.sessions.filter(
        (session) => session.project === projectId
      ),
    }))
    .filter((group) => group.sessions.length > 0);
}

function getWorkerSessionLabel(workerId: string) {
  return workerId.replace(/^\[(.*)\]$/, '$1');
}

function getSelectedTargetWorkspaceModel(
  selectedTerminalSessionKey: string | undefined
): SelectedTargetWorkspaceModel {
  const projectNames = new Map(
    demoHomeWorkspace.projects.map((project) => [project.id, project.name])
  );
  const session = [
    ...(demoHomeWorkspace.orchestrators ?? []),
    ...demoHomeWorkspace.sessions,
  ].find(
    (candidate) =>
      getWorkerSessionSelectionKey(candidate) === selectedTerminalSessionKey
  );

  if (!session) {
    const activeProject = getActiveProjectFixture();

    return {
      agent: 'project',
      cwd: '/Users/tanishqpalandurkar/Projects/better-ao',
      eyebrow: activeProject.name,
      lines: [
        '$ ao status',
        'workers: 8',
        'select a worker or orchestrator to attach a terminal',
      ],
      metadata: 'project',
      previewUrl: 'http://localhost:3000',
      title: 'Project workspace',
    };
  }

  const projectName = projectNames.get(session.project) ?? session.project;
  const isOrchestrator = 'kind' in session && session.kind === 'orchestrator';
  const targetLabel = isOrchestrator
    ? 'Orchestrator'
    : getWorkerSessionLabel(session.workerId);
  const targetKind = isOrchestrator ? 'orchestrator' : 'worker';

  return {
    agent: session.agent,
    cwd: session.cwd ?? '/Users/tanishqpalandurkar/Projects/better-ao',
    eyebrow: `${projectName} / ${targetKind}`,
    lines: [
      isOrchestrator
        ? `$ ao watch --project ${session.project}`
        : `$ ao attach ${targetLabel}`,
      `agent: ${session.agent}`,
      `state: ${session.state}`,
      `cwd: ${session.cwd ?? 'unknown'}`,
    ],
    metadata: session.metadata,
    previewUrl: 'http://localhost:3000',
    title: `${targetLabel} terminal`,
  };
}

function PinnedSessionsSectionStory() {
  const activeProject = getActiveProjectFixture();
  const [projects, setProjects] = useState(demoHomeWorkspace.projects);
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>([
    'ao-tui',
  ]);
  const [pinnedTerminalSessionKeys, setPinnedTerminalSessionKeys] = useState<
    string[]
  >([demoOrchestratorSelectionKey, demoPromptSelectionKey]);
  const [selectedTerminalSessionKey, setSelectedTerminalSessionKey] = useState(
    demoOrchestratorSelectionKey
  );

  return (
    <WorkspaceStoryLayout
      sidebar={
        <ProjectOrchestratorSidebar
          {...sidebarStoryArgs}
          onOrchestratorSessionSelect={setSelectedTerminalSessionKey}
          onProjectDelete={(projectId) => {
            setProjects((currentProjects) =>
              currentProjects.filter((project) => project.id !== projectId)
            );
            setPinnedProjectIds((currentProjectIds) =>
              currentProjectIds.filter(
                (currentProjectId) => currentProjectId !== projectId
              )
            );
          }}
          onProjectPinToggle={(projectId) => {
            setPinnedProjectIds((currentProjectIds) =>
              toggleStoryId(currentProjectIds, projectId)
            );
          }}
          onProjectRename={(projectId) => {
            setProjects((currentProjects) =>
              currentProjects.map((project) =>
                project.id === projectId
                  ? { ...project, name: `${project.name} renamed` }
                  : project
              )
            );
          }}
          onTerminalSessionPinToggle={(selectionKey) => {
            setPinnedTerminalSessionKeys((currentSessionKeys) =>
              toggleStoryId(currentSessionKeys, selectionKey)
            );
          }}
          onWorkerSessionSelect={setSelectedTerminalSessionKey}
          pinnedProjectIds={pinnedProjectIds}
          pinnedTerminalSessionKeys={pinnedTerminalSessionKeys}
          projects={projects}
          selectedTerminalSessionKey={selectedTerminalSessionKey}
        />
      }
    >
      <TerminalWorkspacePanel
        eyebrow={activeProject.name}
        title="Orchestrator"
        lines={[
          '$ ao focus --pinned',
          `pinned sessions: ${pinnedTerminalSessionKeys.length}`,
          `pinned projects: ${pinnedProjectIds.length}`,
        ]}
      />
    </WorkspaceStoryLayout>
  );
}

function TemporaryTooltipDevtoolStory(
  props: ComponentProps<typeof ProjectOrchestratorSidebar>
) {
  const activeProject = getActiveProjectFixture();
  const [tooltipsOpen, setTooltipsOpen] = useState(true);
  const [selectedTerminalSessionKey, setSelectedTerminalSessionKey] = useState(
    props.selectedTerminalSessionKey
  );

  return (
    <>
      <WorkspaceStoryLayout
        sidebar={
          <ProjectOrchestratorSidebar
            {...props}
            onOrchestratorSessionSelect={setSelectedTerminalSessionKey}
            onWorkerSessionSelect={setSelectedTerminalSessionKey}
            selectedTerminalSessionKey={selectedTerminalSessionKey}
            tooltipDevtoolActionsVisible={tooltipsOpen}
          />
        }
      >
        <TemporaryTooltipAuditPanel
          projectName={activeProject.name}
          sections={getTemporaryTooltipAuditSections(props)}
          tooltipsOpen={tooltipsOpen}
        />
      </WorkspaceStoryLayout>
      <TemporaryTooltipDevtoolControl
        tooltipsOpen={tooltipsOpen}
        onToggle={() => setTooltipsOpen((current) => !current)}
      />
    </>
  );
}

interface TemporaryTooltipAuditRow {
  target: string;
  tooltip: string;
}

interface TemporaryTooltipAuditSection {
  rows: TemporaryTooltipAuditRow[];
  title: string;
}

function TemporaryTooltipAuditPanel(props: {
  projectName: string;
  sections: TemporaryTooltipAuditSection[];
  tooltipsOpen: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs leading-4 font-medium text-muted-foreground">
            {props.projectName}
          </p>
          <h2 className="truncate text-lg leading-7 font-semibold">
            Tooltip inspection
          </h2>
        </div>
        <div className="shrink-0 text-right text-xs leading-4 text-muted-foreground">
          {props.tooltipsOpen ? 'Audit view' : 'Hover mode'}
        </div>
      </div>
      {props.tooltipsOpen ? (
        <div className="min-h-0 flex-1 overflow-auto border border-border bg-muted/20">
          <div className="grid min-w-[520px] grid-cols-[minmax(132px,0.52fr)_minmax(220px,1fr)] border-b border-border px-3 py-2 text-xs leading-4 font-medium text-muted-foreground">
            <span>Element</span>
            <span>Tooltip copy</span>
          </div>
          <div className="flex flex-col">
            {props.sections.map((section) => (
              <section key={section.title} className="contents">
                <h3 className="border-b border-border px-3 py-2 text-xs leading-4 font-semibold text-foreground/80">
                  {section.title}
                </h3>
                {section.rows.map((row) => (
                  <div
                    key={`${section.title}:${row.target}:${row.tooltip}`}
                    className="grid min-w-[520px] grid-cols-[minmax(132px,0.52fr)_minmax(220px,1fr)] border-b border-border/60 px-3 py-1.5 text-xs leading-5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {row.target}
                    </span>
                    <span className="min-w-0 text-foreground">
                      {row.tooltip}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          <p>Sidebar tooltips are back to normal hover behavior.</p>
        </div>
      )}
    </div>
  );
}

function TemporaryTooltipDevtoolControl(props: {
  onToggle: () => void;
  tooltipsOpen: boolean;
}) {
  const ToggleIcon = props.tooltipsOpen ? EyeOffIcon : EyeIcon;

  return (
    <div className="fixed right-4 bottom-4 z-50">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="rounded-none shadow-md"
        onClick={props.onToggle}
      >
        <ToggleIcon aria-hidden="true" data-icon="inline-start" />
        <span>{props.tooltipsOpen ? 'Hide tooltips' : 'Show tooltips'}</span>
      </Button>
    </div>
  );
}

function getTemporaryTooltipAuditSections(
  props: ComponentProps<typeof ProjectOrchestratorSidebar>
): TemporaryTooltipAuditSection[] {
  return [
    {
      title: 'Topbar tabs',
      rows: temporarySessionViewTabTooltipRows,
    },
    {
      title: 'Pinned',
      rows: getTemporaryPinnedTooltipAuditRows(props),
    },
    {
      title: 'Projects',
      rows: getTemporaryProjectTooltipAuditRows(props),
    },
  ].filter((section) => section.rows.length > 0);
}

const temporarySessionViewTabTooltipRows = [
  {
    target: 'Kanban tab',
    tooltip: 'Show Kanban board',
  },
] satisfies TemporaryTooltipAuditRow[];

function getTemporaryPinnedTooltipAuditRows(
  props: ComponentProps<typeof ProjectOrchestratorSidebar>
) {
  const rows: TemporaryTooltipAuditRow[] = [];
  const pinnedProjectIds = props.pinnedProjectIds ?? [];
  const pinnedTerminalSessionKeys = props.pinnedTerminalSessionKeys ?? [];
  const projectById = new Map(
    props.projects.map((project) => [project.id, project])
  );
  const terminalSessionsByKey = getTemporaryTerminalSessionAuditItems(props);

  for (const projectId of pinnedProjectIds) {
    const project = projectById.get(projectId);

    if (!project) {
      continue;
    }

    rows.push(
      {
        target: `${project.name} row`,
        tooltip: `Open ${project.name}`,
      },
      {
        target: `${project.name} pin`,
        tooltip: `Unpin ${project.name}`,
      }
    );
  }

  for (const selectionKey of pinnedTerminalSessionKeys) {
    const session = terminalSessionsByKey.get(selectionKey);

    if (!session) {
      continue;
    }

    rows.push(
      {
        target: `${session.label} row`,
        tooltip:
          session.kind === 'worker'
            ? `Open ${session.label} terminal`
            : `Open ${session.label} orchestrator terminal`,
      },
      {
        target: `${session.label} pin`,
        tooltip: `Unpin ${session.label}`,
      }
    );
  }

  return rows;
}

function getTemporaryProjectTooltipAuditRows(
  props: ComponentProps<typeof ProjectOrchestratorSidebar>
) {
  const rows: TemporaryTooltipAuditRow[] = [
    {
      target: 'Add project',
      tooltip: 'Add project',
    },
  ];
  const pinnedTerminalSessionKeys = props.pinnedTerminalSessionKeys ?? [];

  for (const project of props.projects) {
    const projectOpen = props.openProjectIds
      ? props.openProjectIds.includes(project.id)
      : project.id === props.selectedProjectId;

    rows.push(
      {
        target: `${project.name} row`,
        tooltip: projectOpen
          ? `Collapse ${project.name} workers`
          : `Expand ${project.name} workers`,
      },
      {
        target: `${project.name} actions`,
        tooltip: `Open ${project.name} actions`,
      }
    );

    for (const orchestrator of props.orchestrators.filter(
      (candidate) => candidate.project === project.id
    )) {
      const selectionKey = getWorkerSessionSelectionKey(orchestrator);

      rows.push(
        {
          target: 'Orchestrator row',
          tooltip: 'Open orchestrator terminal',
        },
        {
          target: 'Orchestrator pin',
          tooltip: pinnedTerminalSessionKeys.includes(selectionKey)
            ? 'Unpin orchestrator'
            : 'Pin orchestrator',
        }
      );
    }

    for (const group of props.workerSessionGroups) {
      const sessions = group.sessions.filter(
        (session) => session.project === project.id
      );

      if (sessions.length === 0) {
        continue;
      }

      const groupOpen = props.openWorkerSessionGroupIds
        ? props.openWorkerSessionGroupIds.includes(group.id)
        : true;

      rows.push({
        target: `${group.label} group`,
        tooltip: groupOpen
          ? `Collapse ${group.label} sessions`
          : `Expand ${group.label} sessions`,
      });

      for (const session of sessions) {
        const sessionLabel = getWorkerSessionLabel(session.workerId);

        rows.push(
          {
            target: `${sessionLabel} row`,
            tooltip: `Open ${sessionLabel} terminal`,
          },
          {
            target: `${sessionLabel} pin`,
            tooltip: pinnedTerminalSessionKeys.includes(session.selectionKey)
              ? `Unpin ${sessionLabel}`
              : `Pin ${sessionLabel}`,
          }
        );
      }
    }
  }

  return rows;
}

function getTemporaryTerminalSessionAuditItems(
  props: ComponentProps<typeof ProjectOrchestratorSidebar>
) {
  const terminalSessionsByKey = new Map<
    string,
    {
      kind?: WorkerSessionNavItem['kind'];
      label: string;
    }
  >();
  const projectNames = new Map(
    props.projects.map((project) => [project.id, project.name])
  );

  for (const orchestrator of props.orchestrators) {
    terminalSessionsByKey.set(getWorkerSessionSelectionKey(orchestrator), {
      kind: 'orchestrator',
      label: projectNames.get(orchestrator.project) ?? 'Orchestrator',
    });
  }

  for (const group of props.workerSessionGroups) {
    for (const session of group.sessions) {
      terminalSessionsByKey.set(session.selectionKey, {
        kind: session.kind ?? 'worker',
        label: getWorkerSessionLabel(session.workerId),
      });
    }
  }

  return terminalSessionsByKey;
}

function toggleStoryId(currentIds: string[], targetId: string) {
  const nextIds = new Set(currentIds);

  if (nextIds.has(targetId)) {
    nextIds.delete(targetId);
  } else {
    nextIds.add(targetId);
  }

  return Array.from(nextIds);
}
