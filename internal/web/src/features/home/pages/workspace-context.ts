import { createContext, use } from 'react';

import type {
  CanvasTab,
  CanvasTargetSummary,
} from '@/features/home/components/organisms/canvas-panel';
import type { FirstRunProjectCardPhase } from '@/features/home/components/organisms/first-run-project-card';
import type { WorkspacePanelState } from '@/features/home/components/organisms/workspace-status-view';
import type {
  HomeWorkspaceCanvasLayout,
  HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';
import type { AddProjectSource } from '@/features/home/domain/add-project';
import type { ProjectSetupHarnessSelection } from '@/features/home/domain/agent-harness';
import type {
  KanbanColumnData,
  ProjectOrchestrator,
  WorkerSession,
  WorkerWorkspaceMode,
} from '@/features/home/domain/session-workspace';

export interface WorkspaceContextValue {
  canvasAvailable: boolean;
  canvasLayout?: HomeWorkspaceCanvasLayout;
  canvasOpen: boolean;
  canvasPreviewUrl?: string;
  canvasReviewPreferences?: HomeWorkspaceCanvasReviewPreferences;
  canvasResizing: boolean;
  canvasSelectedFilePath?: string;
  canvasTab: CanvasTab;
  canvasTarget: CanvasTargetSummary;
  hasProjects: boolean;
  kanbanColumns: KanbanColumnData[];
  onCanvasLayoutChange: (layout: HomeWorkspaceCanvasLayout) => void;
  onCanvasOpenChange: (open: boolean) => void;
  onCanvasPreviewUrlChange: (url: string) => void;
  onCanvasReviewPreferencesChange: (
    preferences: HomeWorkspaceCanvasReviewPreferences
  ) => void;
  onCanvasResizingChange: (resizing: boolean) => void;
  onCanvasSelectedFilePathChange: (path: string | null) => void;
  onCanvasTabChange: (tab: CanvasTab) => void;
  onAddProject: (source?: AddProjectSource) => void | Promise<void>;
  onChangeStagedProject: () => void;
  onStartProjectSetup: (selection: ProjectSetupHarnessSelection) => void;
  firstRunProjectSetupPhase: FirstRunProjectCardPhase;
  firstRunProjectSetupSelection: ProjectSetupHarnessSelection;
  stagedProjectPath?: string;
  projectSetupStarting: boolean;
  onFirstRunProjectSetupSelectionChange: (
    selection: ProjectSetupHarnessSelection
  ) => void;
  onWorkerWorkspaceModeChange: (mode: WorkerWorkspaceMode) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  onWorkspaceRefresh: () => void;
  selectedProject?: ProjectOrchestrator;
  selectedTerminalSession?: WorkerSession;
  selectedTerminalSessionKey?: string;
  terminalSessions: WorkerSession[];
  workerWorkspaceModePending: boolean;
  workspaceError?: string;
  workspaceState: WorkspacePanelState;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null
);

export function useWorkspaceContext() {
  const context = use(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspaceLayout');
  }

  return context;
}
