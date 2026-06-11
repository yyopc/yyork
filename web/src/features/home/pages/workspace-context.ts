import { createContext, use } from 'react';

import type {
  CanvasTab,
  CanvasTargetSummary,
} from '@/features/home/components/organisms/canvas-panel';
import type { WorkspacePanelState } from '@/features/home/components/organisms/workspace-status-view';
import type {
  HomeWorkspaceCanvasLayout,
  HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';
import type {
  KanbanColumnData,
  WorkerSession,
} from '@/features/home/domain/session-workspace';

export interface WorkspaceContextValue {
  canvasAvailable: boolean;
  canvasLayout?: HomeWorkspaceCanvasLayout;
  canvasOpen: boolean;
  canvasPreviewUrl?: string;
  canvasReviewPreferences?: HomeWorkspaceCanvasReviewPreferences;
  canvasResizing: boolean;
  canvasTab: CanvasTab;
  canvasTarget: CanvasTargetSummary;
  kanbanColumns: KanbanColumnData[];
  onCanvasLayoutChange: (layout: HomeWorkspaceCanvasLayout) => void;
  onCanvasOpenChange: (open: boolean) => void;
  onCanvasPreviewUrlChange: (url: string) => void;
  onCanvasReviewPreferencesChange: (
    preferences: HomeWorkspaceCanvasReviewPreferences
  ) => void;
  onCanvasResizingChange: (resizing: boolean) => void;
  onCanvasTabChange: (tab: CanvasTab) => void;
  onWorkerSessionSelect: (selectionKey: string) => void;
  onWorkspaceRefresh: () => void;
  selectedTerminalSession?: WorkerSession;
  selectedTerminalSessionKey?: string;
  terminalSessions: WorkerSession[];
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
