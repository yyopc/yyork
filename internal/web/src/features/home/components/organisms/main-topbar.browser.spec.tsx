import { act, useState } from 'react';
import { expect, test } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';

import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/features/home/pages/workspace-context';
import { page, render } from '@/tests/utils';

import { MainTopbar } from './main-topbar';

function MainTopbarShortcutHarness(props: { canvasAvailable?: boolean }) {
  const [canvasOpen, setCanvasOpen] = useState(false);
  const workspaceContextValue: WorkspaceContextValue = {
    canvasAvailable: props.canvasAvailable ?? true,
    canvasOpen,
    canvasResizing: false,
    canvasTab: 'files',
    canvasTarget: {},
    firstRunProjectSetupPhase: 'empty',
    firstRunProjectSetupSelection: {
      orchestratorHarnessId: 'codex',
      rememberOrchestratorDefault: false,
      rememberWorkerDefault: false,
      workerHarnessId: 'codex',
    },
    hasProjects: false,
    kanbanColumns: [],
    onAddProject: () => {},
    onCanvasLayoutChange: () => {},
    onCanvasOpenChange: setCanvasOpen,
    onCanvasPreviewUrlChange: () => {},
    onCanvasResizingChange: () => {},
    onCanvasReviewPreferencesChange: () => {},
    onCanvasSelectedFilePathChange: () => {},
    onCanvasTabChange: () => {},
    onChangeStagedProject: () => {},
    onFirstRunProjectSetupSelectionChange: () => {},
    onStartProjectSetup: () => {},
    onWorkerSessionSelect: () => {},
    onWorkerWorkspaceModeChange: () => {},
    onWorkspaceRefresh: () => {},
    projectSetupStarting: false,
    projectSetupUsesDialog: false,
    terminalSessions: [],
    workerWorkspaceModePending: false,
    workspaceState: 'ready',
  };

  return (
    <SidebarProvider defaultOpen>
      <WorkspaceContext value={workspaceContextValue}>
        <MainTopbar />
        <textarea aria-label="Terminal input" />
        <div aria-label="Canvas state" role="status">
          {canvasOpen ? 'open' : 'closed'}
        </div>
      </WorkspaceContext>
    </SidebarProvider>
  );
}

function dispatchCanvasShortcut(target: EventTarget) {
  const usesMetaForMod = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const eventInit = {
    bubbles: true,
    cancelable: true,
    code: 'KeyB',
    ctrlKey: !usesMetaForMod,
    key: 'b',
    metaKey: usesMetaForMod,
    shiftKey: true,
  };

  target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
  target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
}

test('Mod+Shift+B toggles Canvas while terminal input focus is inside the app', async () => {
  render(<MainTopbarShortcutHarness />);

  const input = page.getByLabelText('Terminal input').element();
  input.focus();

  await expect
    .element(page.getByRole('status', { name: 'Canvas state' }))
    .toHaveTextContent('closed');

  act(() => dispatchCanvasShortcut(input));

  await expect
    .element(page.getByRole('status', { name: 'Canvas state' }))
    .toHaveTextContent('open');
});

test('Mod+Shift+B does not toggle Canvas when Canvas is unavailable', async () => {
  render(<MainTopbarShortcutHarness canvasAvailable={false} />);

  const input = page.getByLabelText('Terminal input').element();
  input.focus();

  await expect
    .element(page.getByRole('status', { name: 'Canvas state' }))
    .toHaveTextContent('closed');

  act(() => dispatchCanvasShortcut(input));

  await expect
    .element(page.getByRole('status', { name: 'Canvas state' }))
    .toHaveTextContent('closed');
});
