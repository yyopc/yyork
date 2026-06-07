import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import {
  LayoutDashboardIcon,
  PanelRightIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';

const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const MOD_KEY = isMacPlatform ? '⌘' : 'Ctrl';
const SHIFT_KEY = isMacPlatform ? '⇧' : 'Shift';

import { StopSessionConfirmDialog } from '@/features/home/components/molecules/stop-session-confirm-dialog';
import type {
  CanvasTab,
  CanvasTargetSummary,
} from '@/features/home/components/organisms/canvas-panel';
import { MainTopbar } from '@/features/home/components/organisms/main-topbar';
import { ProjectOrchestratorSidebar } from '@/features/home/components/organisms/project-orchestrator-sidebar';
import type { WorkspacePanelState } from '@/features/home/components/organisms/workspace-status-view';
import { openProjectIdeMutationOptions } from '@/features/home/data/project-ide';
import {
  fallbackHomeWorkspace,
  homeWorkspaceQueryKey,
  homeWorkspaceQueryOptions,
  renameSessionMutationOptions,
  stopSessionMutationOptions,
} from '@/features/home/data/workspace';
import {
  type HomeWorkspaceCanvasLayout,
  type HomeWorkspacePreferences,
  readHomeWorkspacePreferences,
  writeHomeWorkspacePreferences,
} from '@/features/home/data/workspace-preferences';
import {
  getKanbanColumns,
  getSelectedWorkerSession,
  getTerminalSession,
  getWorkerSessionGroups,
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  withSelectedWorkerSession,
  type WorkerSessionState,
  workerSessionStates,
} from '@/features/home/domain/session-workspace';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/features/home/pages/workspace-context';
import { OrchestratorWorkspaceTemplate } from '@/features/home/templates/orchestrator-workspace-template';

export function WorkspaceLayout() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    projectId?: string;
    sessionId?: string;
  };
  const selectedTerminalSessionKey = params.sessionId;
  const boardProjectIdParam = params.projectId;
  const isTerminalRoute = Boolean(selectedTerminalSessionKey);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [pendingSessionStop, setPendingSessionStop] = useState<{
    label: string;
    selectionKey: string;
  } | null>(null);

  const [homeWorkspacePreferences, setHomeWorkspacePreferences] = useState(
    readHomeWorkspacePreferences
  );
  const {
    canvasLayout,
    canvasOpen,
    canvasPreviewUrl,
    hiddenProjectIds,
    hiddenTerminalSessionKeys,
    openProjectIds,
    openWorkerSessionGroupIds,
    pinnedProjectIds,
    pinnedTerminalSessionKeys,
    projectNameOverrides,
    sidebarOpen,
    sidebarWidth,
    skipStopSessionConfirmation,
  } = homeWorkspacePreferences;
  const [canvasResizing, setCanvasResizing] = useState(false);
  const [canvasTab, setCanvasTab] = useState<CanvasTab>('files');
  const workspaceQuery = useQuery(homeWorkspaceQueryOptions());
  const { mutate: openProjectIde } = useMutation(
    openProjectIdeMutationOptions()
  );
  const { mutateAsync: stopSession } = useMutation(
    stopSessionMutationOptions()
  );
  const queryClient = useQueryClient();
  const { mutateAsync: renameSession } = useMutation(
    renameSessionMutationOptions()
  );

  const workspace = workspaceQuery.data ?? fallbackHomeWorkspace;
  const hiddenProjectIdSet = new Set(hiddenProjectIds ?? []);
  const projects: typeof workspace.projects = [];

  for (const project of workspace.projects) {
    if (hiddenProjectIdSet.has(project.id)) {
      continue;
    }

    projects.push({
      ...project,
      name: projectNameOverrides?.[project.id] ?? project.name,
    });
  }

  const projectIds = new Set(projects.map((project) => project.id));
  const hiddenTerminalSessionKeySet = new Set(hiddenTerminalSessionKeys ?? []);
  const workspaceSessions = workspace.sessions.filter(
    (session) =>
      projectIds.has(session.project) &&
      !hiddenTerminalSessionKeySet.has(getWorkerSessionSelectionKey(session))
  );
  const workspaceOrchestrators = (workspace.orchestrators ?? []).filter(
    (session) =>
      projectIds.has(session.project) &&
      !hiddenTerminalSessionKeySet.has(getWorkerSessionSelectionKey(session))
  );
  const sessions = withSelectedWorkerSession(
    workspaceSessions,
    selectedTerminalSessionKey
  );
  const selectedWorkerSession = getSelectedWorkerSession(sessions);
  const terminalSessions = [...workspaceOrchestrators, ...sessions];
  const selectedTerminalSession = isTerminalRoute
    ? (getTerminalSession(terminalSessions, selectedTerminalSessionKey) ??
      selectedWorkerSession)
    : undefined;
  const selectedProjectId =
    selectedTerminalSession?.project ??
    boardProjectIdParam ??
    projects[0]?.id ??
    workspace.activeProjectId;
  const activeBoardProjectId = isTerminalRoute ? undefined : selectedProjectId;
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  const canvasTarget: CanvasTargetSummary = selectedTerminalSession
    ? {
        cwd: selectedTerminalSession.cwd,
        projectId: selectedTerminalSession.project,
        sessionId: selectedTerminalSession.id,
      }
    : {
        cwd: selectedProject?.cwd,
      };
  const defaultOpenProjectIds: string[] =
    selectedProjectId &&
    projects.some((project) => project.id === selectedProjectId)
      ? [selectedProjectId]
      : [];
  const boardSessions = sessions.filter(
    (session) => session.project === selectedProjectId
  );
  const kanbanColumns = getKanbanColumns(boardSessions);
  const workerSessionGroups = getWorkerSessionGroups(sessions);
  const workspaceState: WorkspacePanelState = workspaceQuery.isPending
    ? 'loading'
    : workspaceQuery.isError
      ? 'error'
      : terminalSessions.length === 0
        ? 'empty'
        : 'ready';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'k' ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      setCommandPaletteOpen((open) => !open);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const updateHomeWorkspacePreferences = (
    preferences: Partial<HomeWorkspacePreferences>
  ) => {
    const nextPreferences = {
      ...homeWorkspacePreferences,
      ...preferences,
    };

    writeHomeWorkspacePreferences(nextPreferences);
    setHomeWorkspacePreferences(nextPreferences);
  };

  const handleSidebarOpenChange = (open: boolean) => {
    updateHomeWorkspacePreferences({ sidebarOpen: open });
  };

  const handleSidebarWidthChange = (width: number) => {
    updateHomeWorkspacePreferences({ sidebarWidth: width });
  };

  const handleCanvasOpenChange = (open: boolean) => {
    updateHomeWorkspacePreferences({ canvasOpen: open });
  };

  const handleCanvasLayoutChange = (layout: HomeWorkspaceCanvasLayout) => {
    updateHomeWorkspacePreferences({ canvasLayout: layout });
  };

  const handleCanvasPreviewUrlChange = (url: string) => {
    updateHomeWorkspacePreferences({
      canvasPreviewUrl: url.trim() || undefined,
    });
  };

  const handleProjectOpenChange = (projectId: string, open: boolean) => {
    updateHomeWorkspacePreferences({
      openProjectIds: updateOpenIds(
        openProjectIds,
        projectId,
        open,
        defaultOpenProjectIds
      ),
    });
  };

  const handleWorkerSessionGroupOpenChange = (
    groupId: WorkerSessionState,
    open: boolean
  ) => {
    updateHomeWorkspacePreferences({
      openWorkerSessionGroupIds: updateOpenIds(
        openWorkerSessionGroupIds,
        groupId,
        open,
        workerSessionStates
      ),
    });
  };

  const handleProjectPinToggle = (projectId: string) => {
    updateHomeWorkspacePreferences({
      pinnedProjectIds: toggleId(pinnedProjectIds, projectId),
    });
  };

  const handleProjectIdeOpen = (project: ProjectOrchestrator) => {
    openProjectIde(project, {
      onError: (error) => {
        toast.error('Could not open project', {
          description:
            error instanceof Error
              ? error.message
              : 'The local IDE could not be opened.',
        });
      },
      onSuccess: (result) => {
        toast.success('Opened project', {
          description: result.cwd,
        });
      },
    });
  };

  const handleTerminalSessionPinToggle = (selectionKey: string) => {
    updateHomeWorkspacePreferences({
      pinnedTerminalSessionKeys: toggleId(
        pinnedTerminalSessionKeys,
        selectionKey
      ),
    });
  };

  const handleTerminalSessionRename = (
    selectionKey: string,
    currentLabel: string
  ) => {
    if (typeof window === 'undefined') {
      return;
    }

    const sessionId = getSessionIdFromSelectionKey(selectionKey);
    if (!sessionId) {
      return;
    }

    const nextLabel = window.prompt('Rename session', currentLabel);
    if (nextLabel === null) {
      return;
    }

    // The backend is the source of truth: it trims/truncates, persists the
    // displayName, and emits a session.updated SSE event so every client
    // converges. An empty value clears the override back to the auto-derived
    // title, so we send the trimmed string straight through.
    const normalizedLabel = nextLabel.trim();
    if (normalizedLabel === currentLabel) {
      return;
    }

    renameSession({ sessionId, displayName: normalizedLabel })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: homeWorkspaceQueryKey,
        });
      })
      .catch((error: unknown) => {
        toast.error('Could not rename session', {
          description:
            error instanceof Error
              ? error.message
              : 'The session could not be renamed.',
        });
      });
  };

  const executeTerminalSessionStop = (selectionKey: string) => {
    const sessionId = getSessionIdFromSelectionKey(selectionKey);
    if (!sessionId) {
      return;
    }

    stopSession(sessionId).catch((error: unknown) => {
      toast.error('Could not stop session', {
        description:
          error instanceof Error
            ? error.message
            : `The session could not be terminated.`,
      });
    });

    if (selectedTerminalSessionKey === selectionKey) {
      void navigate({ to: '/' });
    }
  };

  const handleTerminalSessionDelete = (
    selectionKey: string,
    currentLabel: string
  ) => {
    if (skipStopSessionConfirmation) {
      executeTerminalSessionStop(selectionKey);
      return;
    }

    setPendingSessionStop({ selectionKey, label: currentLabel });
  };

  const handleConfirmSessionStop = (dontShowAgain: boolean) => {
    if (!pendingSessionStop) {
      return;
    }

    if (dontShowAgain) {
      updateHomeWorkspacePreferences({
        skipStopSessionConfirmation: true,
      });
    }

    executeTerminalSessionStop(pendingSessionStop.selectionKey);
    setPendingSessionStop(null);
  };

  const handleTerminalSessionHide = (
    selectionKey: string,
    currentLabel: string
  ) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!window.confirm(`Hide ${currentLabel} from sidebar?`)) {
      return;
    }

    updateHomeWorkspacePreferences({
      hiddenTerminalSessionKeys: addId(hiddenTerminalSessionKeys, selectionKey),
      pinnedTerminalSessionKeys: (pinnedTerminalSessionKeys ?? []).filter(
        (key) => key !== selectionKey
      ),
    });

    if (selectedTerminalSessionKey === selectionKey) {
      void navigate({ to: '/' });
    }
  };

  const handleProjectRename = (projectId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const project = projects.find((project) => project.id === projectId);
    if (!project) {
      return;
    }

    const nextProjectName = window.prompt('Rename project', project.name);
    const normalizedProjectName = nextProjectName?.trim();

    if (!normalizedProjectName || normalizedProjectName === project.name) {
      return;
    }

    updateHomeWorkspacePreferences({
      projectNameOverrides: {
        ...projectNameOverrides,
        [projectId]: normalizedProjectName,
      },
    });
  };

  const handleProjectDelete = (projectId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const project = projects.find((project) => project.id === projectId);
    if (!project || !window.confirm(`Delete ${project.name} from sidebar?`)) {
      return;
    }

    const projectSelectionKeyPrefix = `${encodeURIComponent(projectId)}:`;

    updateHomeWorkspacePreferences({
      hiddenProjectIds: addId(hiddenProjectIds, projectId),
      openProjectIds: (openProjectIds ?? defaultOpenProjectIds).filter(
        (openProjectId) => openProjectId !== projectId
      ),
      pinnedProjectIds: (pinnedProjectIds ?? []).filter(
        (pinnedProjectId) => pinnedProjectId !== projectId
      ),
      pinnedTerminalSessionKeys: (pinnedTerminalSessionKeys ?? []).filter(
        (selectionKey) => !selectionKey.startsWith(projectSelectionKeyPrefix)
      ),
    });

    if (selectedTerminalSessionKey?.startsWith(projectSelectionKeyPrefix)) {
      void navigate({ to: '/' });
    }
  };

  const handleProjectBoardSelect = (projectId: string) => {
    updateHomeWorkspacePreferences({
      openProjectIds: updateOpenIds(
        openProjectIds,
        projectId,
        true,
        defaultOpenProjectIds
      ),
    });

    void navigate({
      to: '/board/$projectId',
      params: { projectId },
    });
  };

  const handleTerminalSessionOpen = (selectionKey: string) => {
    const targetProjectId = getProjectIdFromSelectionKey(selectionKey);

    if (targetProjectId) {
      updateHomeWorkspacePreferences({
        openProjectIds: updateOpenIds(
          openProjectIds,
          targetProjectId,
          true,
          defaultOpenProjectIds
        ),
      });
    }

    void navigate({
      to: '/terminal/$sessionId',
      params: { sessionId: selectionKey },
    });
  };

  const workspaceContextValue: WorkspaceContextValue = {
    canvasAvailable: isTerminalRoute,
    canvasLayout,
    canvasOpen,
    canvasPreviewUrl,
    canvasResizing,
    canvasTab,
    canvasTarget,
    kanbanColumns,
    onCanvasLayoutChange: handleCanvasLayoutChange,
    onCanvasOpenChange: handleCanvasOpenChange,
    onCanvasPreviewUrlChange: handleCanvasPreviewUrlChange,
    onCanvasResizingChange: setCanvasResizing,
    onCanvasTabChange: setCanvasTab,
    onWorkerSessionSelect: handleTerminalSessionOpen,
    onWorkspaceRefresh: () => void workspaceQuery.refetch(),
    selectedTerminalSession,
    selectedTerminalSessionKey,
    terminalSessions,
    workspaceError:
      workspaceQuery.error instanceof Error
        ? workspaceQuery.error.message
        : undefined,
    workspaceState,
  };

  return (
    <WorkspaceContext value={workspaceContextValue}>
      <OrchestratorWorkspaceTemplate
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onSidebarOpenChange={handleSidebarOpenChange}
        onSidebarWidthChange={handleSidebarWidthChange}
        primarySidebar={
          <ProjectOrchestratorSidebar
            activeBoardProjectId={activeBoardProjectId}
            onOrchestratorSessionSelect={handleTerminalSessionOpen}
            onProjectBoardSelect={handleProjectBoardSelect}
            onProjectDelete={handleProjectDelete}
            onProjectIdeOpen={handleProjectIdeOpen}
            onProjectPinToggle={handleProjectPinToggle}
            onProjectOpenChange={handleProjectOpenChange}
            onProjectRename={handleProjectRename}
            onTerminalSessionDelete={handleTerminalSessionDelete}
            onTerminalSessionHide={handleTerminalSessionHide}
            onTerminalSessionPinToggle={handleTerminalSessionPinToggle}
            onTerminalSessionRename={handleTerminalSessionRename}
            onWorkerSessionGroupOpenChange={handleWorkerSessionGroupOpenChange}
            projects={projects}
            pinnedProjectIds={pinnedProjectIds}
            pinnedTerminalSessionKeys={pinnedTerminalSessionKeys}
            selectedProjectId={selectedProjectId}
            selectedTerminalSessionKey={selectedTerminalSessionKey}
            openProjectIds={openProjectIds}
            openWorkerSessionGroupIds={openWorkerSessionGroupIds}
            onWorkerSessionSelect={handleTerminalSessionOpen}
            orchestrators={workspaceOrchestrators}
            workerSessionGroups={workerSessionGroups}
          />
        }
        topbar={<MainTopbar />}
        main={<Outlet />}
      />
      <StopSessionConfirmDialog
        open={pendingSessionStop !== null}
        sessionLabel={pendingSessionStop?.label ?? 'session'}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSessionStop(null);
          }
        }}
        onConfirm={handleConfirmSessionStop}
      />
      <CommandDialog
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      >
        <CommandInput placeholder="Search boards, sessions, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Boards">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`board ${project.name}`}
                onSelect={() => {
                  handleProjectBoardSelect(project.id);
                  setCommandPaletteOpen(false);
                }}
              >
                <LayoutDashboardIcon aria-hidden="true" />
                <span>{project.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Sessions">
            {terminalSessions.map((session) => {
              const selectionKey = getWorkerSessionSelectionKey(session);
              const projectName =
                projects.find((project) => project.id === session.project)
                  ?.name ?? session.project;
              const sessionSuffix =
                session.kind === 'orchestrator'
                  ? 'orchestrator'
                  : session.title.trim() || `new agent: ${session.id}`;
              const label = `${projectName} / ${sessionSuffix}`;

              return (
                <CommandItem
                  key={selectionKey}
                  value={`session ${label} ${session.workerId} ${session.issue}`}
                  onSelect={() => {
                    handleTerminalSessionOpen(selectionKey);
                    setCommandPaletteOpen(false);
                  }}
                >
                  <SquareTerminalIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem
              value="toggle sidebar"
              onSelect={() => {
                handleSidebarOpenChange(!sidebarOpen);
                setCommandPaletteOpen(false);
              }}
            >
              <PanelRightIcon aria-hidden="true" className="rotate-180" />
              <span>{sidebarOpen ? 'Close sidebar' : 'Open sidebar'}</span>
              <CommandShortcut>
                <Kbd>{MOD_KEY}</Kbd>
                <span aria-hidden="true">+</span>
                <Kbd>B</Kbd>
              </CommandShortcut>
            </CommandItem>
            {isTerminalRoute ? (
              <CommandItem
                value="toggle canvas panel"
                onSelect={() => {
                  handleCanvasOpenChange(!canvasOpen);
                  setCommandPaletteOpen(false);
                }}
              >
                <PanelRightIcon aria-hidden="true" />
                <span>
                  {canvasOpen ? 'Close Canvas panel' : 'Open Canvas panel'}
                </span>
                <CommandShortcut>
                  <Kbd>{MOD_KEY}</Kbd>
                  <span aria-hidden="true">+</span>
                  <Kbd>{SHIFT_KEY}</Kbd>
                  <span aria-hidden="true">+</span>
                  <Kbd>B</Kbd>
                </CommandShortcut>
              </CommandItem>
            ) : null}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </WorkspaceContext>
  );
}

function addId(currentIds: string[] | undefined, targetId: string) {
  return Array.from(new Set([...(currentIds ?? []), targetId]));
}

function toggleId(currentIds: string[] | undefined, targetId: string) {
  const nextIds = new Set(currentIds ?? []);

  if (nextIds.has(targetId)) {
    nextIds.delete(targetId);
  } else {
    nextIds.add(targetId);
  }

  return Array.from(nextIds);
}

function updateOpenIds<T extends string>(
  currentIds: T[] | undefined,
  targetId: T,
  open: boolean,
  defaultIds: readonly T[]
) {
  const nextIds = new Set(currentIds ?? defaultIds);

  if (open) {
    nextIds.add(targetId);
  } else {
    nextIds.delete(targetId);
  }

  return Array.from(nextIds);
}

function getProjectIdFromSelectionKey(selectionKey: string) {
  const [encodedProjectId] = selectionKey.split(':', 1);

  if (!encodedProjectId) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedProjectId);
  } catch {
    return undefined;
  }
}

function getSessionIdFromSelectionKey(selectionKey: string) {
  const parts = selectionKey.split(':');
  if (parts.length < 2) {
    return undefined;
  }
  const encodedSessionId = parts[1];
  if (!encodedSessionId) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedSessionId);
  } catch {
    return undefined;
  }
}
