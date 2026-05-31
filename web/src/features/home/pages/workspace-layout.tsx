import { useMutation, useQuery } from '@tanstack/react-query';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import {
  LayoutDashboardIcon,
  PanelRightIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  homeWorkspaceQueryOptions,
  stopSessionMutationOptions,
} from '@/features/home/data/workspace';
import {
  defaultHomeWorkspacePreferences,
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

  const [hasRestoredPreferences, setHasRestoredPreferences] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    defaultHomeWorkspacePreferences.sidebarOpen
  );
  const [sidebarWidth, setSidebarWidth] = useState<number | undefined>(
    defaultHomeWorkspacePreferences.sidebarWidth
  );
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasResizing, setCanvasResizing] = useState(false);
  const [canvasLayout, setCanvasLayout] = useState<
    HomeWorkspaceCanvasLayout | undefined
  >(defaultHomeWorkspacePreferences.canvasLayout);
  const [canvasPreviewUrl, setCanvasPreviewUrl] = useState<string | undefined>(
    defaultHomeWorkspacePreferences.canvasPreviewUrl
  );
  const [canvasTab, setCanvasTab] = useState<CanvasTab>('files');
  const workspaceQuery = useQuery(homeWorkspaceQueryOptions());
  const { mutate: openProjectIde } = useMutation(
    openProjectIdeMutationOptions()
  );
  const { mutateAsync: stopSession } = useMutation(
    stopSessionMutationOptions()
  );

  const workspace = workspaceQuery.data ?? fallbackHomeWorkspace;
  const [openProjectIds, setOpenProjectIds] = useState<string[] | undefined>(
    defaultHomeWorkspacePreferences.openProjectIds
  );
  const [pinnedProjectIds, setPinnedProjectIds] = useState<
    string[] | undefined
  >(defaultHomeWorkspacePreferences.pinnedProjectIds);
  const [pinnedTerminalSessionKeys, setPinnedTerminalSessionKeys] = useState<
    string[] | undefined
  >(defaultHomeWorkspacePreferences.pinnedTerminalSessionKeys);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<
    string[] | undefined
  >(defaultHomeWorkspacePreferences.hiddenProjectIds);
  const [hiddenTerminalSessionKeys, setHiddenTerminalSessionKeys] = useState<
    string[] | undefined
  >(defaultHomeWorkspacePreferences.hiddenTerminalSessionKeys);
  const [projectNameOverrides, setProjectNameOverrides] = useState<
    Record<string, string> | undefined
  >(defaultHomeWorkspacePreferences.projectNameOverrides);
  const [sessionLabelOverrides, setSessionLabelOverrides] = useState<
    Record<string, string> | undefined
  >(defaultHomeWorkspacePreferences.sessionLabelOverrides);
  const [openWorkerSessionGroupIds, setOpenWorkerSessionGroupIds] = useState<
    WorkerSessionState[] | undefined
  >(defaultHomeWorkspacePreferences.openWorkerSessionGroupIds);

  const projects = useMemo(
    () =>
      workspace.projects
        .filter((project) => !hiddenProjectIds?.includes(project.id))
        .map((project) => ({
          ...project,
          name: projectNameOverrides?.[project.id] ?? project.name,
        })),
    [hiddenProjectIds, projectNameOverrides, workspace.projects]
  );
  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects]
  );
  const hiddenTerminalSessionKeySet = useMemo(
    () => new Set(hiddenTerminalSessionKeys ?? []),
    [hiddenTerminalSessionKeys]
  );
  const workspaceSessions = useMemo(
    () =>
      workspace.sessions.filter(
        (session) =>
          projectIds.has(session.project) &&
          !hiddenTerminalSessionKeySet.has(
            getWorkerSessionSelectionKey(session)
          )
      ),
    [hiddenTerminalSessionKeySet, projectIds, workspace.sessions]
  );
  const workspaceOrchestrators = useMemo(
    () =>
      (workspace.orchestrators ?? []).filter(
        (session) =>
          projectIds.has(session.project) &&
          !hiddenTerminalSessionKeySet.has(
            getWorkerSessionSelectionKey(session)
          )
      ),
    [hiddenTerminalSessionKeySet, projectIds, workspace.orchestrators]
  );
  const sessions = useMemo(
    () =>
      withSelectedWorkerSession(workspaceSessions, selectedTerminalSessionKey),
    [selectedTerminalSessionKey, workspaceSessions]
  );
  const selectedWorkerSession = getSelectedWorkerSession(sessions);
  const terminalSessions = useMemo(
    () => [...workspaceOrchestrators, ...sessions],
    [sessions, workspaceOrchestrators]
  );
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
  const canvasTarget = useMemo<CanvasTargetSummary>(
    () =>
      selectedTerminalSession
        ? {
            cwd: selectedTerminalSession.cwd,
            projectId: selectedTerminalSession.project,
            sessionId: selectedTerminalSession.id,
          }
        : {
            cwd: selectedProject?.cwd,
          },
    [selectedProject?.cwd, selectedTerminalSession]
  );
  const defaultOpenProjectIds = useMemo(
    () =>
      projects.some((project) => project.id === selectedProjectId)
        ? [selectedProjectId]
        : [],
    [projects, selectedProjectId]
  );
  const boardSessions = useMemo(
    () => sessions.filter((session) => session.project === selectedProjectId),
    [sessions, selectedProjectId]
  );
  const kanbanColumns = useMemo(
    () => getKanbanColumns(boardSessions),
    [boardSessions]
  );
  const workerSessionGroups = useMemo(
    () => getWorkerSessionGroups(sessions),
    [sessions]
  );
  const workspaceState: WorkspacePanelState = workspaceQuery.isPending
    ? 'loading'
    : workspaceQuery.isError
      ? 'error'
      : terminalSessions.length === 0
        ? 'empty'
        : 'ready';

  useEffect(() => {
    const preferences = readHomeWorkspacePreferences();

    setSidebarOpen(preferences.sidebarOpen);
    setSidebarWidth(preferences.sidebarWidth);
    setCanvasOpen(preferences.canvasOpen);
    setCanvasLayout(preferences.canvasLayout);
    setCanvasPreviewUrl(preferences.canvasPreviewUrl);
    setOpenProjectIds(preferences.openProjectIds);
    setOpenWorkerSessionGroupIds(preferences.openWorkerSessionGroupIds);
    setPinnedProjectIds(preferences.pinnedProjectIds);
    setPinnedTerminalSessionKeys(preferences.pinnedTerminalSessionKeys);
    setHiddenProjectIds(preferences.hiddenProjectIds);
    setHiddenTerminalSessionKeys(preferences.hiddenTerminalSessionKeys);
    setProjectNameOverrides(preferences.projectNameOverrides);
    setSessionLabelOverrides(preferences.sessionLabelOverrides);
    setHasRestoredPreferences(true);
  }, []);

  useEffect(() => {
    if (!hasRestoredPreferences) {
      return;
    }

    writeHomeWorkspacePreferences({
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
      sessionLabelOverrides,
      sidebarOpen,
      sidebarWidth,
    });
  }, [
    hasRestoredPreferences,
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
    sessionLabelOverrides,
    sidebarOpen,
    sidebarWidth,
  ]);

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

  const persistHomeWorkspacePreferences = useCallback(
    (preferences: Partial<HomeWorkspacePreferences>) => {
      writeHomeWorkspacePreferences({
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
        sessionLabelOverrides,
        sidebarOpen,
        sidebarWidth,
        ...preferences,
      });
    },
    [
      hiddenProjectIds,
      canvasLayout,
      canvasOpen,
      canvasPreviewUrl,
      hiddenTerminalSessionKeys,
      openProjectIds,
      openWorkerSessionGroupIds,
      pinnedProjectIds,
      pinnedTerminalSessionKeys,
      projectNameOverrides,
      sessionLabelOverrides,
      sidebarOpen,
      sidebarWidth,
    ]
  );

  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      persistHomeWorkspacePreferences({ sidebarOpen: open });
      setSidebarOpen(open);
    },
    [persistHomeWorkspacePreferences]
  );

  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
  }, []);

  const handleCanvasOpenChange = useCallback(
    (open: boolean) => {
      persistHomeWorkspacePreferences({ canvasOpen: open });
      setCanvasOpen(open);
    },
    [persistHomeWorkspacePreferences]
  );

  const handleCanvasLayoutChange = useCallback(
    (layout: HomeWorkspaceCanvasLayout) => {
      persistHomeWorkspacePreferences({ canvasLayout: layout });
      setCanvasLayout(layout);
    },
    [persistHomeWorkspacePreferences]
  );

  const handleCanvasPreviewUrlChange = useCallback(
    (url: string) => {
      const nextCanvasPreviewUrl = url.trim() || undefined;

      persistHomeWorkspacePreferences({
        canvasPreviewUrl: nextCanvasPreviewUrl,
      });
      setCanvasPreviewUrl(nextCanvasPreviewUrl);
    },
    [persistHomeWorkspacePreferences]
  );

  const handleProjectOpenChange = useCallback(
    (projectId: string, open: boolean) => {
      const nextOpenProjectIds = updateOpenIds(
        openProjectIds,
        projectId,
        open,
        defaultOpenProjectIds
      );

      persistHomeWorkspacePreferences({ openProjectIds: nextOpenProjectIds });
      setOpenProjectIds(nextOpenProjectIds);
    },
    [defaultOpenProjectIds, openProjectIds, persistHomeWorkspacePreferences]
  );

  const handleWorkerSessionGroupOpenChange = useCallback(
    (groupId: WorkerSessionState, open: boolean) => {
      const nextOpenWorkerSessionGroupIds = updateOpenIds(
        openWorkerSessionGroupIds,
        groupId,
        open,
        workerSessionStates
      );

      persistHomeWorkspacePreferences({
        openWorkerSessionGroupIds: nextOpenWorkerSessionGroupIds,
      });
      setOpenWorkerSessionGroupIds(nextOpenWorkerSessionGroupIds);
    },
    [openWorkerSessionGroupIds, persistHomeWorkspacePreferences]
  );

  const handleProjectPinToggle = useCallback(
    (projectId: string) => {
      const nextPinnedProjectIds = toggleId(pinnedProjectIds, projectId);

      persistHomeWorkspacePreferences({
        pinnedProjectIds: nextPinnedProjectIds,
      });
      setPinnedProjectIds(nextPinnedProjectIds);
    },
    [pinnedProjectIds, persistHomeWorkspacePreferences]
  );

  const handleProjectIdeOpen = useCallback(
    (project: ProjectOrchestrator) => {
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
    },
    [openProjectIde]
  );

  const handleTerminalSessionPinToggle = useCallback(
    (selectionKey: string) => {
      const nextPinnedTerminalSessionKeys = toggleId(
        pinnedTerminalSessionKeys,
        selectionKey
      );

      persistHomeWorkspacePreferences({
        pinnedTerminalSessionKeys: nextPinnedTerminalSessionKeys,
      });
      setPinnedTerminalSessionKeys(nextPinnedTerminalSessionKeys);
    },
    [pinnedTerminalSessionKeys, persistHomeWorkspacePreferences]
  );

  const handleTerminalSessionRename = useCallback(
    (selectionKey: string, currentLabel: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      const nextLabel = window.prompt('Rename session', currentLabel);
      const normalizedLabel = nextLabel?.trim();

      if (!normalizedLabel || normalizedLabel === currentLabel) {
        return;
      }

      const nextSessionLabelOverrides = {
        ...sessionLabelOverrides,
        [selectionKey]: normalizedLabel,
      };

      persistHomeWorkspacePreferences({
        sessionLabelOverrides: nextSessionLabelOverrides,
      });
      setSessionLabelOverrides(nextSessionLabelOverrides);
    },
    [persistHomeWorkspacePreferences, sessionLabelOverrides]
  );

  const handleTerminalSessionDelete = useCallback(
    (selectionKey: string, currentLabel: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      if (
        !window.confirm(
          `Stop ${currentLabel}? This will terminate the agent process and remove its worktree.`
        )
      ) {
        return;
      }

      const sessionId = getSessionIdFromSelectionKey(selectionKey);
      if (!sessionId) {
        return;
      }

      stopSession(sessionId).catch((error: unknown) => {
        toast.error('Could not stop session', {
          description:
            error instanceof Error
              ? error.message
              : 'The session could not be terminated.',
        });
      });

      if (selectedTerminalSessionKey === selectionKey) {
        void navigate({ to: '/' });
      }
    },
    [navigate, selectedTerminalSessionKey, stopSession]
  );

  const handleTerminalSessionHide = useCallback(
    (selectionKey: string, currentLabel: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      if (!window.confirm(`Hide ${currentLabel} from sidebar?`)) {
        return;
      }

      const nextHiddenTerminalSessionKeys = addId(
        hiddenTerminalSessionKeys,
        selectionKey
      );
      const nextPinnedTerminalSessionKeys = (
        pinnedTerminalSessionKeys ?? []
      ).filter((key) => key !== selectionKey);

      persistHomeWorkspacePreferences({
        hiddenTerminalSessionKeys: nextHiddenTerminalSessionKeys,
        pinnedTerminalSessionKeys: nextPinnedTerminalSessionKeys,
      });
      startTransition(() => {
        setHiddenTerminalSessionKeys(nextHiddenTerminalSessionKeys);
        setPinnedTerminalSessionKeys(nextPinnedTerminalSessionKeys);
      });

      if (selectedTerminalSessionKey === selectionKey) {
        void navigate({ to: '/' });
      }
    },
    [
      hiddenTerminalSessionKeys,
      navigate,
      persistHomeWorkspacePreferences,
      pinnedTerminalSessionKeys,
      selectedTerminalSessionKey,
    ]
  );

  const handleProjectRename = useCallback(
    (projectId: string) => {
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

      const nextProjectNameOverrides = {
        ...projectNameOverrides,
        [projectId]: normalizedProjectName,
      };

      persistHomeWorkspacePreferences({
        projectNameOverrides: nextProjectNameOverrides,
      });
      setProjectNameOverrides(nextProjectNameOverrides);
    },
    [persistHomeWorkspacePreferences, projectNameOverrides, projects]
  );

  const handleProjectDelete = useCallback(
    (projectId: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      const project = projects.find((project) => project.id === projectId);
      if (!project || !window.confirm(`Delete ${project.name} from sidebar?`)) {
        return;
      }

      const nextHiddenProjectIds = addId(hiddenProjectIds, projectId);
      const nextOpenProjectIds = (
        openProjectIds ?? defaultOpenProjectIds
      ).filter((openProjectId) => openProjectId !== projectId);
      const nextPinnedProjectIds = (pinnedProjectIds ?? []).filter(
        (pinnedProjectId) => pinnedProjectId !== projectId
      );
      const projectSelectionKeyPrefix = `${encodeURIComponent(projectId)}:`;
      const nextPinnedTerminalSessionKeys = (
        pinnedTerminalSessionKeys ?? []
      ).filter(
        (selectionKey) => !selectionKey.startsWith(projectSelectionKeyPrefix)
      );

      persistHomeWorkspacePreferences({
        hiddenProjectIds: nextHiddenProjectIds,
        openProjectIds: nextOpenProjectIds,
        pinnedProjectIds: nextPinnedProjectIds,
        pinnedTerminalSessionKeys: nextPinnedTerminalSessionKeys,
      });
      startTransition(() => {
        setHiddenProjectIds(nextHiddenProjectIds);
        setOpenProjectIds(nextOpenProjectIds);
        setPinnedProjectIds(nextPinnedProjectIds);
        setPinnedTerminalSessionKeys(nextPinnedTerminalSessionKeys);
      });

      if (selectedTerminalSessionKey?.startsWith(projectSelectionKeyPrefix)) {
        void navigate({ to: '/' });
      }
    },
    [
      defaultOpenProjectIds,
      hiddenProjectIds,
      navigate,
      openProjectIds,
      persistHomeWorkspacePreferences,
      pinnedProjectIds,
      pinnedTerminalSessionKeys,
      projects,
      selectedTerminalSessionKey,
    ]
  );

  const handleProjectBoardSelect = useCallback(
    (projectId: string) => {
      const nextOpenProjectIds = updateOpenIds(
        openProjectIds,
        projectId,
        true,
        defaultOpenProjectIds
      );

      if (nextOpenProjectIds !== openProjectIds) {
        persistHomeWorkspacePreferences({ openProjectIds: nextOpenProjectIds });
        setOpenProjectIds(nextOpenProjectIds);
      }

      void navigate({
        to: '/board/$projectId',
        params: { projectId },
      });
    },
    [
      defaultOpenProjectIds,
      navigate,
      openProjectIds,
      persistHomeWorkspacePreferences,
    ]
  );

  const handleTerminalSessionOpen = useCallback(
    (selectionKey: string) => {
      const targetProjectId = getProjectIdFromSelectionKey(selectionKey);
      const nextOpenProjectIds = targetProjectId
        ? updateOpenIds(
            openProjectIds,
            targetProjectId,
            true,
            defaultOpenProjectIds
          )
        : openProjectIds;

      if (nextOpenProjectIds !== openProjectIds) {
        persistHomeWorkspacePreferences({
          openProjectIds: nextOpenProjectIds,
        });
        setOpenProjectIds(nextOpenProjectIds);
      }

      void navigate({
        to: '/terminal/$sessionId',
        params: { sessionId: selectionKey },
      });
    },
    [
      defaultOpenProjectIds,
      navigate,
      openProjectIds,
      persistHomeWorkspacePreferences,
    ]
  );

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
            sessionLabelOverrides={sessionLabelOverrides}
            workerSessionGroups={workerSessionGroups}
          />
        }
        topbar={<MainTopbar />}
        main={<Outlet />}
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
                sessionLabelOverrides?.[selectionKey] ??
                (session.kind === 'orchestrator'
                  ? 'orchestrator'
                  : session.title.trim() ||
                    session.workerId.replace(/^\[(.*)\]$/, '$1'));
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

  try {
    return decodeURIComponent(parts[1]);
  } catch {
    return undefined;
  }
}
