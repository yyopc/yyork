import { useHotkey } from '@tanstack/react-hotkeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { useGlimm } from 'glimm/react';
import {
  FolderPlusIcon,
  LayoutDashboardIcon,
  PanelRightIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import { toast } from 'sonner';

import { appHotkeys } from '@/lib/app-hotkeys';
import {
  clearStagedNamedropAnchor,
  stageNamedropAnchor,
} from '@/lib/glimm/glimm-namedrop-anchor';
import { sweepProjectAdded } from '@/lib/glimm/sweep-project-added';
import { sweepProjectRemoved } from '@/lib/glimm/sweep-project-removed';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

import { AppShortcutsDialog } from '@/features/home/components/molecules/app-shortcuts-dialog';
import { ProjectSetupDialog } from '@/features/home/components/molecules/project-setup-dialog';
import { StopSessionConfirmDialog } from '@/features/home/components/molecules/stop-session-confirm-dialog';
import type {
  CanvasTab,
  CanvasTargetSummary,
} from '@/features/home/components/organisms/canvas-panel';
import type { FirstRunProjectCardPhase } from '@/features/home/components/organisms/first-run-project-card';
import { MainTopbar } from '@/features/home/components/organisms/main-topbar';
import { ProjectOrchestratorSidebar } from '@/features/home/components/organisms/project-orchestrator-sidebar';
import type { WorkspacePanelState } from '@/features/home/components/organisms/workspace-status-view';
import {
  readAgentHarnessDefaults,
  writeAgentHarnessDefaults,
} from '@/features/home/data/agent-harness-preferences';
import {
  clearFirstRunProjectSetupDraft,
  defaultFirstRunProjectSetupSelection,
  readFirstRunProjectSetupDraft,
  updateFirstRunProjectSetupDraft,
  writeFirstRunProjectSetupDraft,
} from '@/features/home/data/first-run-project-setup-draft';
import { openProjectIdeMutationOptions } from '@/features/home/data/project-ide';
import {
  chooseProjectDirectoryMutationOptions,
  createProjectMutationOptions,
  type CreateProjectResult,
  fallbackHomeWorkspace,
  homeWorkspaceQueryKey,
  homeWorkspaceQueryOptions,
  patchWorkspaceWithAddedProject,
  patchWorkspaceWithRemovedProject,
  removeProjectMutationOptions,
  renameSessionMutationOptions,
  stopSessionMutationOptions,
  updateProjectWorkerWorkspaceMutationOptions,
} from '@/features/home/data/workspace';
import {
  getCanvasPreviewTargetKey,
  getCanvasPreviewUrlForTarget,
  getCanvasPreviewUrlPreferenceUpdate,
  getCanvasSelectedFilePathForTarget,
  getCanvasSelectedFilePathPreferenceUpdate,
  type HomeWorkspaceCanvasLayout,
  type HomeWorkspaceCanvasReviewPreferences,
  type HomeWorkspacePreferences,
  readHomeWorkspacePreferences,
  writeHomeWorkspacePreferences,
} from '@/features/home/data/workspace-preferences';
import type { AddProjectSource } from '@/features/home/domain/add-project';
import type { ProjectSetupHarnessSelection } from '@/features/home/domain/agent-harness';
import {
  getKanbanColumns,
  getProjectByIdOrPath,
  getProjectIdFromSelectionKey,
  getProjectPath,
  getSelectedWorkerSession,
  getSessionIdFromSelectionKey,
  getTerminalRouteTarget,
  getTerminalSession,
  getTerminalSessionForRoute,
  getWorkerSessionGroups,
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  terminalSessionIdRequiresProject,
  withSelectedWorkerSession,
  type WorkerSession,
  type WorkerSessionState,
  workerSessionStates,
  type WorkerWorkspaceMode,
} from '@/features/home/domain/session-workspace';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/features/home/pages/workspace-context';
import { OrchestratorWorkspaceTemplate } from '@/features/home/templates/orchestrator-workspace-template';

interface PendingSessionStop {
  label: string;
  selectionKey: string;
}

interface WorkspaceLayoutState {
  canvasResizing: boolean;
  canvasTab: CanvasTab;
  commandPaletteOpen: boolean;
  homeWorkspacePreferences: HomeWorkspacePreferences;
  pendingSessionStop: PendingSessionStop | null;
}

type WorkspaceLayoutAction =
  | { open: boolean | ((open: boolean) => boolean); type: 'command-palette' }
  | { pendingSessionStop: PendingSessionStop | null; type: 'pending-stop' }
  | {
      homeWorkspacePreferences: HomeWorkspacePreferences;
      type: 'workspace-preferences';
    }
  | { canvasResizing: boolean; type: 'canvas-resizing' }
  | { canvasTab: CanvasTab; type: 'canvas-tab' };

function createWorkspaceLayoutState(): WorkspaceLayoutState {
  const homeWorkspacePreferences = readHomeWorkspacePreferences();

  return {
    canvasResizing: false,
    canvasTab: homeWorkspacePreferences.canvasTab ?? 'files',
    commandPaletteOpen: false,
    homeWorkspacePreferences,
    pendingSessionStop: null,
  };
}

function workspaceLayoutReducer(
  state: WorkspaceLayoutState,
  action: WorkspaceLayoutAction
): WorkspaceLayoutState {
  switch (action.type) {
    case 'command-palette':
      return {
        ...state,
        commandPaletteOpen:
          typeof action.open === 'function'
            ? action.open(state.commandPaletteOpen)
            : action.open,
      };
    case 'pending-stop':
      return {
        ...state,
        pendingSessionStop: action.pendingSessionStop,
      };
    case 'workspace-preferences':
      return {
        ...state,
        homeWorkspacePreferences: action.homeWorkspacePreferences,
      };
    case 'canvas-resizing':
      return {
        ...state,
        canvasResizing: action.canvasResizing,
      };
    case 'canvas-tab':
      return {
        ...state,
        canvasTab: action.canvasTab,
      };
  }
}

export function WorkspaceLayout() {
  const workspaceLayout = useWorkspaceLayout();

  return <WorkspaceLayoutView {...workspaceLayout} />;
}

function getInitialFirstRunProjectSetupState() {
  const draft = readFirstRunProjectSetupDraft();
  const savedDefaults = readAgentHarnessDefaults();

  if (!draft) {
    return {
      phase: 'empty' as const,
      projectPath: undefined,
      selection: {
        ...defaultFirstRunProjectSetupSelection,
        ...savedDefaults,
      },
    };
  }

  const { projectPath, ...selection } = draft;

  return {
    phase: 'agents' as const,
    projectPath,
    selection: {
      ...defaultFirstRunProjectSetupSelection,
      ...savedDefaults,
      ...selection,
    },
  };
}

function useWorkspaceLayout() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    projectId?: string;
    sessionId?: string;
  };
  const search = useSearch({ strict: false }) as { project?: unknown };
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [initialFirstRunProjectSetup] = useState(
    getInitialFirstRunProjectSetupState
  );
  const [firstRunProjectSetupPhase, setFirstRunProjectSetupPhase] =
    useState<FirstRunProjectCardPhase>(initialFirstRunProjectSetup.phase);
  const [stagedProjectPath, setStagedProjectPath] = useState<
    string | undefined
  >(initialFirstRunProjectSetup.projectPath);
  const [firstRunProjectSetupSelection, setFirstRunProjectSetupSelection] =
    useState<ProjectSetupHarnessSelection>(
      initialFirstRunProjectSetup.selection
    );
  const [projectSetupStarting, setProjectSetupStarting] = useState(false);
  const [projectSetupUsesDialog, setProjectSetupUsesDialog] = useState(false);
  const terminalRouteTarget = getTerminalRouteTarget(
    params.sessionId,
    getOptionalSearchString(search.project)
  );
  const boardProjectIdParam = params.projectId;
  const isTerminalRoute = Boolean(terminalRouteTarget);
  const [layoutState, dispatchLayout] = useReducer(
    workspaceLayoutReducer,
    undefined,
    createWorkspaceLayoutState
  );
  const {
    canvasResizing,
    canvasTab,
    commandPaletteOpen,
    homeWorkspacePreferences,
    pendingSessionStop,
  } = layoutState;
  const {
    canvasLayout,
    canvasOpen,
    hiddenTerminalSessionKeys,
    openProjectIds,
    openWorkerSessionGroupIds,
    pinnedProjectIds,
    pinnedTerminalSessionKeys,
    projectNameOverrides,
    canvasReview: canvasReviewPreferences,
    sidebarOpen,
    sidebarWidth,
    skipStopSessionConfirmation,
  } = homeWorkspacePreferences;
  const {
    data: queriedWorkspace,
    error: workspaceQueryError,
    isError: workspaceQueryIsError,
    isPending: workspaceQueryIsPending,
    refetch: refetchWorkspace,
  } = useQuery(homeWorkspaceQueryOptions());
  const { mutate: openProjectIde } = useMutation(
    openProjectIdeMutationOptions()
  );
  const { mutateAsync: stopSession } = useMutation(
    stopSessionMutationOptions()
  );
  const queryClient = useQueryClient();
  const { sweep } = useGlimm();
  const { mutateAsync: renameSession } = useMutation(
    renameSessionMutationOptions()
  );
  const { mutateAsync: createProject } = useMutation(
    createProjectMutationOptions()
  );
  const { mutateAsync: removeProject } = useMutation(
    removeProjectMutationOptions()
  );
  const { mutateAsync: chooseProjectDirectory } = useMutation(
    chooseProjectDirectoryMutationOptions()
  );
  const {
    isPending: workerWorkspaceModePending,
    mutate: updateProjectWorkerWorkspace,
  } = useMutation(updateProjectWorkerWorkspaceMutationOptions());

  const workspace = queriedWorkspace ?? fallbackHomeWorkspace;
  const projects = workspace.projects.map((project) => ({
    ...project,
    name: projectNameOverrides?.[project.id] ?? project.name,
  }));

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
  const routeSelectedWorkerSession = getTerminalSessionForRoute(
    workspaceSessions,
    terminalRouteTarget
  );
  const routeSelectedWorkerSessionKey = routeSelectedWorkerSession
    ? getWorkerSessionSelectionKey(routeSelectedWorkerSession)
    : terminalRouteTarget?.selectionKey;
  const sessions = withSelectedWorkerSession(
    workspaceSessions,
    routeSelectedWorkerSessionKey
  );
  const selectedWorkerSession = getSelectedWorkerSession(sessions);
  const terminalSessions = [...workspaceOrchestrators, ...sessions];
  const routeProject = getProjectByIdOrPath(projects, boardProjectIdParam);
  const activeWorkspaceProject = getProjectByIdOrPath(
    projects,
    workspace.activeProjectId
  );
  const defaultProjectId =
    routeProject?.id ?? activeWorkspaceProject?.id ?? projects[0]?.id;
  const defaultOrchestratorSession =
    !selectedWorkerSession && defaultProjectId
      ? workspaceOrchestrators.find(
          (session) => session.project === defaultProjectId
        )
      : undefined;
  const defaultOrchestratorSessionRouteProject =
    defaultOrchestratorSession &&
    terminalSessionIdRequiresProject(
      terminalSessions,
      defaultOrchestratorSession.id
    )
      ? defaultOrchestratorSession.project
      : undefined;
  const selectedTerminalSession = isTerminalRoute
    ? (getTerminalSessionForRoute(terminalSessions, terminalRouteTarget) ??
      selectedWorkerSession)
    : undefined;
  const selectedTerminalSessionKey = selectedTerminalSession
    ? getWorkerSessionSelectionKey(selectedTerminalSession)
    : routeSelectedWorkerSessionKey;
  const terminalRouteTargetLegacy =
    terminalRouteTarget?.legacySelectionKey ?? false;
  const terminalRouteTargetProject = terminalRouteTarget?.project;
  const terminalRouteTargetSessionId = terminalRouteTarget?.sessionId;
  const selectedTerminalSessionId = selectedTerminalSession?.id;
  const selectedTerminalSessionProject = selectedTerminalSession?.project;
  const selectedTerminalSessionRouteProject =
    selectedTerminalSession &&
    terminalSessionIdRequiresProject(
      terminalSessions,
      selectedTerminalSession.id
    )
      ? selectedTerminalSession.project
      : undefined;
  const selectedProjectId =
    selectedTerminalSession?.project ?? defaultProjectId;
  const activeBoardProjectId = isTerminalRoute ? undefined : selectedProjectId;
  const selectedProject = getProjectByIdOrPath(projects, selectedProjectId);
  const canvasTarget: CanvasTargetSummary = selectedTerminalSession
    ? {
        cwd: selectedTerminalSession.cwd,
        projectId: selectedTerminalSession.project,
        projectName: selectedProject?.name,
        sessionId: selectedTerminalSession.id,
      }
    : {
        cwd: getProjectPath(selectedProject),
        projectId: selectedProject?.id,
        projectName: selectedProject?.name,
      };
  const canvasPreviewTargetKey = getCanvasPreviewTargetKey(canvasTarget);
  const canvasPreviewUrl = getCanvasPreviewUrlForTarget(
    homeWorkspacePreferences,
    canvasPreviewTargetKey
  );
  const canvasSelectedFilePath = getCanvasSelectedFilePathForTarget(
    homeWorkspacePreferences,
    canvasPreviewTargetKey
  );
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
  const workspaceState: WorkspacePanelState = workspaceQueryIsPending
    ? 'loading'
    : workspaceQueryIsError
      ? 'error'
      : terminalSessions.length === 0
        ? 'empty'
        : 'ready';
  const routeProjectId = routeProject?.id;

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    clearFirstRunProjectSetupDraft();
    setFirstRunProjectSetupPhase('empty');
    setStagedProjectPath(undefined);
    setFirstRunProjectSetupSelection(defaultFirstRunProjectSetupSelection);
    setProjectSetupUsesDialog(false);
  }, [projects.length]);

  useEffect(() => {
    if (
      !boardProjectIdParam ||
      !routeProjectId ||
      routeProjectId === boardProjectIdParam
    ) {
      return;
    }

    void navigate({
      replace: true,
      to: '/board/$projectId',
      params: { projectId: routeProjectId },
    });
  }, [boardProjectIdParam, navigate, routeProjectId]);

  useEffect(() => {
    if (
      isTerminalRoute ||
      boardProjectIdParam ||
      !defaultOrchestratorSession ||
      workspaceQueryIsPending ||
      workspaceQueryIsError
    ) {
      return;
    }

    void navigate({
      to: '/terminal/$sessionId',
      params: { sessionId: defaultOrchestratorSession.id },
      search: defaultOrchestratorSessionRouteProject
        ? { project: defaultOrchestratorSessionRouteProject }
        : {},
    });
  }, [
    boardProjectIdParam,
    defaultOrchestratorSession,
    defaultOrchestratorSessionRouteProject,
    isTerminalRoute,
    navigate,
    workspaceQueryIsError,
    workspaceQueryIsPending,
  ]);

  useEffect(() => {
    if (
      !terminalRouteTargetLegacy ||
      !selectedTerminalSessionId ||
      selectedTerminalSessionId !== terminalRouteTargetSessionId ||
      selectedTerminalSessionProject !== terminalRouteTargetProject
    ) {
      return;
    }

    void navigate({
      replace: true,
      search: selectedTerminalSessionRouteProject
        ? { project: selectedTerminalSessionRouteProject }
        : {},
      params: { sessionId: selectedTerminalSessionId },
      to: '/terminal/$sessionId',
    });
  }, [
    navigate,
    selectedTerminalSessionId,
    selectedTerminalSessionProject,
    selectedTerminalSessionRouteProject,
    terminalRouteTargetLegacy,
    terminalRouteTargetProject,
    terminalRouteTargetSessionId,
  ]);

  const updateHomeWorkspacePreferences = (
    preferences: Partial<HomeWorkspacePreferences>
  ) => {
    const nextPreferences = {
      ...homeWorkspacePreferences,
      ...preferences,
    };

    writeHomeWorkspacePreferences(nextPreferences);
    dispatchLayout({
      homeWorkspacePreferences: nextPreferences,
      type: 'workspace-preferences',
    });
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

  const handleCanvasTabChange = (tab: CanvasTab) => {
    dispatchLayout({ canvasTab: tab, type: 'canvas-tab' });
    updateHomeWorkspacePreferences({ canvasTab: tab });
  };

  const handleCanvasPreviewUrlChange = (url: string) => {
    updateHomeWorkspacePreferences(
      getCanvasPreviewUrlPreferenceUpdate(
        homeWorkspacePreferences,
        canvasPreviewTargetKey,
        url
      )
    );
  };

  const handleCanvasSelectedFilePathChange = (path: string | null) => {
    updateHomeWorkspacePreferences(
      getCanvasSelectedFilePathPreferenceUpdate(
        homeWorkspacePreferences,
        canvasPreviewTargetKey,
        path
      )
    );
  };

  const handleCanvasReviewPreferencesChange = (
    preferences: HomeWorkspaceCanvasReviewPreferences
  ) => {
    updateHomeWorkspacePreferences({ canvasReview: preferences });
  };

  const handleWorkerWorkspaceModeChange = (mode: WorkerWorkspaceMode) => {
    if (!selectedProject) {
      return;
    }

    updateProjectWorkerWorkspace(
      { projectId: selectedProject.id, workerWorkspaceMode: mode },
      {
        onError: (error) => {
          toast.error('Could not update worker workspace', {
            description:
              error instanceof Error
                ? error.message
                : 'The project setting could not be saved.',
          });
        },
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: homeWorkspaceQueryKey,
          });
        },
      }
    );
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
    const projectId = getProjectIdFromSelectionKey(selectionKey);

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

    renameSession({ sessionId, displayName: normalizedLabel, projectId })
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
    const projectId = getProjectIdFromSelectionKey(selectionKey);

    stopSession({ sessionId, projectId }).catch((error: unknown) => {
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

    dispatchLayout({
      pendingSessionStop: { label: currentLabel, selectionKey },
      type: 'pending-stop',
    });
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
    dispatchLayout({ pendingSessionStop: null, type: 'pending-stop' });
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

  const commitAddedProject = (result: CreateProjectResult) => {
    updateHomeWorkspacePreferences({
      openProjectIds: updateOpenIds(
        openProjectIds,
        result.id,
        true,
        defaultOpenProjectIds
      ),
    });

    patchWorkspaceWithAddedProject(queryClient, result);

    // When the orchestrator already existed (created === false) no
    // session.created event fires, so refresh explicitly instead of waiting
    // on the light poll.
    void queryClient.invalidateQueries({ queryKey: homeWorkspaceQueryKey });

    void navigate({
      to: '/board/$projectId',
      params: { projectId: result.id },
    });
  };

  const handleAddProject = async (source?: AddProjectSource) => {
    if (typeof window === 'undefined') {
      return;
    }

    stageNamedropAnchor(source);

    try {
      // Pop the host machine's native folder picker (macOS Finder) and let the
      // server hand back the absolute path the browser itself can't read.
      const picked = await chooseProjectDirectory();
      if (!picked) {
        clearStagedNamedropAnchor();
        return; // user dismissed the picker
      }

      const savedDefaults = readAgentHarnessDefaults();
      const nextSelection: ProjectSetupHarnessSelection = {
        ...defaultFirstRunProjectSetupSelection,
        ...savedDefaults,
      };

      writeFirstRunProjectSetupDraft({
        ...nextSelection,
        projectPath: picked.path,
      });
      setFirstRunProjectSetupSelection(nextSelection);
      setStagedProjectPath(picked.path);
      setFirstRunProjectSetupPhase('agents');
      setProjectSetupUsesDialog(projects.length > 0);
    } catch (error) {
      clearStagedNamedropAnchor();
      window.alert(
        error instanceof Error ? error.message : 'Failed to add project'
      );
    }
  };

  const handleChangeStagedProject = () => {
    clearFirstRunProjectSetupDraft();
    setStagedProjectPath(undefined);
    setFirstRunProjectSetupPhase('empty');
    setProjectSetupUsesDialog(false);
    clearStagedNamedropAnchor();
  };

  const handleFirstRunProjectSetupSelectionChange = (
    selection: ProjectSetupHarnessSelection
  ) => {
    setFirstRunProjectSetupSelection(selection);

    if (!stagedProjectPath) {
      return;
    }

    updateFirstRunProjectSetupDraft({
      ...selection,
      projectPath: stagedProjectPath,
    });
  };

  const handleStartProjectSetup = async (
    selection: ProjectSetupHarnessSelection
  ) => {
    if (!stagedProjectPath || typeof window === 'undefined') {
      return;
    }

    setProjectSetupStarting(true);

    try {
      const result = await createProject({
        path: stagedProjectPath,
        agentPlugin: selection.orchestratorHarnessId,
        workerAgentPlugin: selection.workerHarnessId,
      });

      if (
        selection.rememberOrchestratorDefault ||
        selection.rememberWorkerDefault
      ) {
        const savedDefaults = readAgentHarnessDefaults();
        writeAgentHarnessDefaults({
          orchestratorHarnessId: selection.rememberOrchestratorDefault
            ? selection.orchestratorHarnessId
            : (savedDefaults?.orchestratorHarnessId ??
              defaultFirstRunProjectSetupSelection.orchestratorHarnessId),
          workerHarnessId: selection.rememberWorkerDefault
            ? selection.workerHarnessId
            : (savedDefaults?.workerHarnessId ??
              defaultFirstRunProjectSetupSelection.workerHarnessId),
        });
      }

      sweepProjectAdded(sweep, () => {
        clearFirstRunProjectSetupDraft();
        setFirstRunProjectSetupPhase('empty');
        setStagedProjectPath(undefined);
        setFirstRunProjectSetupSelection(defaultFirstRunProjectSetupSelection);
        setProjectSetupUsesDialog(false);
        commitAddedProject(result);
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Failed to add project'
      );
    } finally {
      setProjectSetupStarting(false);
      clearStagedNamedropAnchor();
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

  const commitRemovedProject = (projectId: string) => {
    const projectSelectionKeyPrefix = `${encodeURIComponent(projectId)}:`;

    updateHomeWorkspacePreferences({
      hiddenTerminalSessionKeys: (hiddenTerminalSessionKeys ?? []).filter(
        (selectionKey) => !selectionKey.startsWith(projectSelectionKeyPrefix)
      ),
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

    patchWorkspaceWithRemovedProject(queryClient, projectId);
    void queryClient.invalidateQueries({ queryKey: homeWorkspaceQueryKey });

    if (selectedTerminalSessionKey?.startsWith(projectSelectionKeyPrefix)) {
      void navigate({ to: '/' });
    }
  };

  const handleProjectDelete = (projectId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const project = projects.find((project) => project.id === projectId);
    if (
      !project ||
      !window.confirm(
        `Remove ${project.name} from yyork? This stops yyork sessions for the project but does not delete repository files.`
      )
    ) {
      return;
    }

    removeProject({ projectId })
      .then(() => {
        sweepProjectRemoved(sweep, () => commitRemovedProject(projectId));
      })
      .catch((error: unknown) => {
        toast.error('Could not remove project', {
          description:
            error instanceof Error
              ? error.message
              : 'The project was not removed from yyork.',
        });
      });
  };

  useHotkey(
    appHotkeys.commandPalette,
    () => {
      dispatchLayout({ open: (open) => !open, type: 'command-palette' });
    },
    {
      requireReset: true,
    }
  );

  useHotkey(
    appHotkeys.addProject,
    () => {
      void handleAddProject();
    },
    {
      requireReset: true,
    }
  );

  useHotkey(
    appHotkeys.deleteProject,
    () => {
      if (selectedProjectId) {
        handleProjectDelete(selectedProjectId);
      }
    },
    {
      enabled: Boolean(selectedProjectId),
      requireReset: true,
    }
  );

  useHotkey(
    appHotkeys.deleteProjectForward,
    () => {
      if (selectedProjectId) {
        handleProjectDelete(selectedProjectId);
      }
    },
    {
      enabled: Boolean(selectedProjectId),
      requireReset: true,
    }
  );

  useHotkey(
    appHotkeys.viewShortcuts,
    () => {
      setShortcutsDialogOpen((open) => !open);
    },
    {
      requireReset: true,
    }
  );

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
    const targetSession = getTerminalSession(terminalSessions, selectionKey);
    const targetSessionId =
      targetSession?.id ?? getSessionIdFromSelectionKey(selectionKey);
    const targetProjectId = getProjectIdFromSelectionKey(selectionKey);

    if (!targetSessionId) {
      return;
    }

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
      params: { sessionId: targetSessionId },
      search: targetSession
        ? getTerminalRouteSearch(terminalSessions, targetSession)
        : targetProjectId
          ? { project: targetProjectId }
          : {},
    });
  };

  const workspaceContextValue: WorkspaceContextValue = {
    canvasAvailable: isTerminalRoute,
    canvasLayout,
    canvasOpen,
    canvasPreviewUrl,
    canvasReviewPreferences,
    canvasResizing,
    canvasSelectedFilePath,
    canvasTab,
    canvasTarget,
    hasProjects: projects.length > 0,
    kanbanColumns,
    onCanvasLayoutChange: handleCanvasLayoutChange,
    onCanvasOpenChange: handleCanvasOpenChange,
    onCanvasPreviewUrlChange: handleCanvasPreviewUrlChange,
    onCanvasReviewPreferencesChange: handleCanvasReviewPreferencesChange,
    onCanvasResizingChange: (canvasResizing) =>
      dispatchLayout({ canvasResizing, type: 'canvas-resizing' }),
    onCanvasSelectedFilePathChange: handleCanvasSelectedFilePathChange,
    onCanvasTabChange: handleCanvasTabChange,
    onAddProject: handleAddProject,
    onChangeStagedProject: handleChangeStagedProject,
    onStartProjectSetup: handleStartProjectSetup,
    firstRunProjectSetupPhase,
    firstRunProjectSetupSelection,
    onFirstRunProjectSetupSelectionChange:
      handleFirstRunProjectSetupSelectionChange,
    stagedProjectPath,
    projectSetupStarting,
    projectSetupUsesDialog,
    onWorkerWorkspaceModeChange: handleWorkerWorkspaceModeChange,
    onWorkerSessionSelect: handleTerminalSessionOpen,
    onWorkspaceRefresh: () => void refetchWorkspace(),
    selectedProject,
    selectedTerminalSession,
    selectedTerminalSessionKey,
    terminalSessions,
    workerWorkspaceModePending,
    workspaceError:
      workspaceQueryError instanceof Error
        ? workspaceQueryError.message
        : undefined,
    workspaceState,
  };

  return {
    activeBoardProjectId,
    canvasOpen,
    commandPaletteOpen,
    handleAddProject,
    handleChangeStagedProject,
    handleCanvasOpenChange,
    handleConfirmSessionStop,
    handleProjectBoardSelect,
    handleProjectDelete,
    handleProjectIdeOpen,
    handleProjectOpenChange,
    handleProjectPinToggle,
    handleProjectRename,
    handleSidebarOpenChange,
    handleSidebarWidthChange,
    handleTerminalSessionDelete,
    handleTerminalSessionHide,
    handleTerminalSessionOpen,
    handleTerminalSessionPinToggle,
    handleTerminalSessionRename,
    handleWorkerSessionGroupOpenChange,
    isTerminalRoute,
    openProjectIds,
    openWorkerSessionGroupIds,
    pendingSessionStop,
    pinnedProjectIds,
    pinnedTerminalSessionKeys,
    projects,
    selectedProjectId,
    selectedTerminalSessionKey,
    setCommandPaletteOpen: (open: boolean | ((open: boolean) => boolean)) =>
      dispatchLayout({ open, type: 'command-palette' }),
    setPendingSessionStop: (pendingSessionStop: PendingSessionStop | null) =>
      dispatchLayout({ pendingSessionStop, type: 'pending-stop' }),
    setShortcutsDialogOpen,
    shortcutsDialogOpen,
    sidebarOpen,
    sidebarWidth,
    terminalSessions,
    workerSessionGroups,
    workspaceContextValue,
    workspaceOrchestrators,
  };
}

function WorkspaceLayoutView(props: ReturnType<typeof useWorkspaceLayout>) {
  const selectedProject = props.projects.find(
    (project) => project.id === props.selectedProjectId
  );
  const showProjectSetupDialog =
    props.workspaceContextValue.projectSetupUsesDialog &&
    props.workspaceContextValue.firstRunProjectSetupPhase === 'agents' &&
    Boolean(props.workspaceContextValue.stagedProjectPath);

  return (
    <WorkspaceContext value={props.workspaceContextValue}>
      <OrchestratorWorkspaceTemplate
        sidebarOpen={props.sidebarOpen}
        sidebarWidth={props.sidebarWidth}
        onSidebarOpenChange={props.handleSidebarOpenChange}
        onSidebarWidthChange={props.handleSidebarWidthChange}
        primarySidebar={
          <ProjectOrchestratorSidebar
            activeBoardProjectId={props.activeBoardProjectId}
            onAddProject={props.handleAddProject}
            onOrchestratorSessionSelect={props.handleTerminalSessionOpen}
            onProjectBoardSelect={props.handleProjectBoardSelect}
            onProjectDelete={props.handleProjectDelete}
            onProjectIdeOpen={props.handleProjectIdeOpen}
            onProjectPinToggle={props.handleProjectPinToggle}
            onProjectOpenChange={props.handleProjectOpenChange}
            onProjectRename={props.handleProjectRename}
            onTerminalSessionDelete={props.handleTerminalSessionDelete}
            onTerminalSessionHide={props.handleTerminalSessionHide}
            onTerminalSessionPinToggle={props.handleTerminalSessionPinToggle}
            onTerminalSessionRename={props.handleTerminalSessionRename}
            onWorkerSessionGroupOpenChange={
              props.handleWorkerSessionGroupOpenChange
            }
            projects={props.projects}
            pinnedProjectIds={props.pinnedProjectIds}
            pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys}
            selectedProjectId={props.selectedProjectId ?? ''}
            selectedTerminalSessionKey={props.selectedTerminalSessionKey}
            openProjectIds={props.openProjectIds}
            openWorkerSessionGroupIds={props.openWorkerSessionGroupIds}
            onWorkerSessionSelect={props.handleTerminalSessionOpen}
            orchestrators={props.workspaceOrchestrators}
            workerSessionGroups={props.workerSessionGroups}
          />
        }
        topbar={<MainTopbar />}
        main={<Outlet />}
      />
      <StopSessionConfirmDialog
        open={props.pendingSessionStop !== null}
        sessionLabel={props.pendingSessionStop?.label ?? 'session'}
        onOpenChange={(open) => {
          if (!open) {
            props.setPendingSessionStop(null);
          }
        }}
        onConfirm={props.handleConfirmSessionStop}
      />
      <ProjectSetupDialog
        open={showProjectSetupDialog}
        projectPath={props.workspaceContextValue.stagedProjectPath ?? ''}
        agentSetup={props.workspaceContextValue.firstRunProjectSetupSelection}
        starting={props.workspaceContextValue.projectSetupStarting}
        onOpenChange={(open) => {
          if (!open) {
            props.handleChangeStagedProject();
          }
        }}
        onCancel={props.handleChangeStagedProject}
        onAgentSetupChange={
          props.workspaceContextValue.onFirstRunProjectSetupSelectionChange
        }
        onStartProject={props.workspaceContextValue.onStartProjectSetup}
      />
      <AppShortcutsDialog
        open={props.shortcutsDialogOpen}
        onOpenChange={props.setShortcutsDialogOpen}
      />
      <CommandDialog
        open={props.commandPaletteOpen}
        onOpenChange={props.setCommandPaletteOpen}
      >
        <CommandInput placeholder="Search boards, sessions, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Boards">
            {props.projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`board ${project.name}`}
                onSelect={() => {
                  props.handleProjectBoardSelect(project.id);
                  props.setCommandPaletteOpen(false);
                }}
              >
                <LayoutDashboardIcon aria-hidden="true" />
                <span>{project.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Sessions">
            {props.terminalSessions.map((session) => {
              const selectionKey = getWorkerSessionSelectionKey(session);
              const projectName =
                props.projects.find((project) => project.id === session.project)
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
                    props.handleTerminalSessionOpen(selectionKey);
                    props.setCommandPaletteOpen(false);
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
              value="add project open folder"
              onSelect={() => {
                void props.handleAddProject();
                props.setCommandPaletteOpen(false);
              }}
            >
              <FolderPlusIcon aria-hidden="true" />
              <span>Add project</span>
              <CommandShortcut hotkey={appHotkeys.addProject} />
            </CommandItem>
            {selectedProject ? (
              <CommandItem
                value={`remove current project ${selectedProject.name}`}
                onSelect={() => {
                  props.handleProjectDelete(selectedProject.id);
                  props.setCommandPaletteOpen(false);
                }}
              >
                <Trash2Icon aria-hidden="true" />
                <span>Remove current project</span>
                <CommandShortcut hotkey={appHotkeys.deleteProject} />
              </CommandItem>
            ) : null}
            <CommandItem
              value="toggle sidebar"
              onSelect={() => {
                props.handleSidebarOpenChange(!props.sidebarOpen);
                props.setCommandPaletteOpen(false);
              }}
            >
              <PanelRightIcon aria-hidden="true" className="rotate-180" />
              <span>
                {props.sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              </span>
              <CommandShortcut hotkey={appHotkeys.toggleSidebar} />
            </CommandItem>
            {props.isTerminalRoute ? (
              <CommandItem
                value="toggle canvas panel"
                onSelect={() => {
                  props.handleCanvasOpenChange(!props.canvasOpen);
                  props.setCommandPaletteOpen(false);
                }}
              >
                <PanelRightIcon aria-hidden="true" />
                <span>
                  {props.canvasOpen
                    ? 'Close Canvas panel'
                    : 'Open Canvas panel'}
                </span>
                <CommandShortcut hotkey={appHotkeys.toggleCanvas} />
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

function getOptionalSearchString(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function getTerminalRouteSearch(
  terminalSessions: WorkerSession[],
  targetSession: WorkerSession
): { project?: string } {
  return terminalSessionIdRequiresProject(terminalSessions, targetSession.id)
    ? { project: targetSession.project }
    : {};
}
