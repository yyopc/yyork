import { act, useState } from 'react';
import { expect, test, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';

import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/features/home/pages/workspace-context';
import { page, render, setupUser } from '@/tests/utils';

import { MainTopbar } from './main-topbar';

function MainTopbarShortcutHarness(props: {
  canvasAvailable?: boolean;
  canvasTab?: WorkspaceContextValue['canvasTab'];
  initialCanvasOpen?: boolean;
}) {
  const [canvasOpen, setCanvasOpen] = useState(
    props.initialCanvasOpen ?? false
  );
  const workspaceContextValue: WorkspaceContextValue = {
    canvasAvailable: props.canvasAvailable ?? true,
    canvasOpen,
    canvasResizing: false,
    canvasTab: props.canvasTab ?? 'files',
    canvasTarget: {},
    confirmBeforeStoppingSessions: true,
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
    onConfirmBeforeStoppingSessionsChange: () => {},
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
        <output aria-label="Canvas state">
          {canvasOpen ? 'open' : 'closed'}
        </output>
      </WorkspaceContext>
    </SidebarProvider>
  );
}

function MainTopbarWorkspaceHarness(props: {
  canvasAvailable?: boolean;
  canvasOpen?: boolean;
  onWorkerWorkspaceModeChange: WorkspaceContextValue['onWorkerWorkspaceModeChange'];
  selectedTerminalSession?: WorkspaceContextValue['selectedTerminalSession'];
}) {
  const workspaceContextValue: WorkspaceContextValue = {
    canvasAvailable: props.canvasAvailable ?? false,
    canvasOpen: props.canvasOpen ?? false,
    canvasResizing: false,
    canvasTab: 'files',
    canvasTarget: {},
    confirmBeforeStoppingSessions: true,
    firstRunProjectSetupPhase: 'empty',
    firstRunProjectSetupSelection: {
      orchestratorHarnessId: 'codex',
      rememberOrchestratorDefault: false,
      rememberWorkerDefault: false,
      workerHarnessId: 'codex',
    },
    hasProjects: true,
    kanbanColumns: [],
    onAddProject: () => {},
    onCanvasLayoutChange: () => {},
    onCanvasOpenChange: () => {},
    onCanvasPreviewUrlChange: () => {},
    onCanvasResizingChange: () => {},
    onCanvasReviewPreferencesChange: () => {},
    onCanvasSelectedFilePathChange: () => {},
    onCanvasTabChange: () => {},
    onChangeStagedProject: () => {},
    onConfirmBeforeStoppingSessionsChange: () => {},
    onFirstRunProjectSetupSelectionChange: () => {},
    onStartProjectSetup: () => {},
    onWorkerSessionSelect: () => {},
    onWorkerWorkspaceModeChange: props.onWorkerWorkspaceModeChange,
    onWorkspaceRefresh: () => {},
    projectSetupStarting: false,
    projectSetupUsesDialog: false,
    selectedProject: {
      cwd: '/repo/app',
      id: 'app',
      name: 'app',
      path: '/repo/app',
      workerWorkspaceMode: 'local',
    },
    selectedTerminalSession:
      props.selectedTerminalSession === undefined
        ? {
            agent: 'codex',
            cwd: '/repo/app',
            description: '',
            id: 'worker-1',
            issue: '',
            kind: 'worker',
            metadata: JSON.stringify({ workspaceMode: 'local' }),
            project: 'app',
            recap: '',
            state: 'prompt',
            title: 'Design discussion',
            workerId: 'worker-1',
          }
        : props.selectedTerminalSession,
    terminalSessions: [],
    workerWorkspaceModePending: false,
    workspaceState: 'ready',
  };

  return (
    <SidebarProvider defaultOpen>
      <WorkspaceContext value={workspaceContextValue}>
        <MainTopbar />
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

function resolveCssColor(value: string) {
  const swatch = document.createElement('span');
  swatch.style.color = value;
  document.body.append(swatch);
  const color = getComputedStyle(swatch).color;
  swatch.remove();

  return color;
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

test('active Canvas tab uses sidebar foreground text color', async () => {
  const previousTheme = localStorage.getItem('theme');
  localStorage.setItem('theme', 'dark');

  try {
    render(<MainTopbarShortcutHarness initialCanvasOpen canvasTab="review" />);
    await expect
      .poll(() => document.documentElement.classList.contains('dark'))
      .toBe(true);

    const reviewTab = page.getByRole('tab', { name: 'Review' }).element();
    const reviewTabStyle = getComputedStyle(reviewTab);

    expect(reviewTabStyle.backgroundColor).toBe(
      resolveCssColor('var(--border)')
    );
    expect(reviewTabStyle.fontSize).toBe('12px');
    expect(reviewTabStyle.lineHeight).toBe('16px');
    expect(reviewTabStyle.color).toBe(
      resolveCssColor('var(--sidebar-foreground)')
    );
  } finally {
    if (previousTheme === null) {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', previousTheme);
    }
  }
});

test('workspace select shows fork action for the selected worker session', async () => {
  const user = setupUser();
  const onWorkerWorkspaceModeChange = vi.fn();

  render(
    <MainTopbarWorkspaceHarness
      onWorkerWorkspaceModeChange={onWorkerWorkspaceModeChange}
    />
  );

  const workspaceSelectTrigger = page.getByRole('combobox', {
    name: 'Worker workspace',
  });
  const triggerStyle = getComputedStyle(workspaceSelectTrigger.element());
  expect(triggerStyle.height).toBe('28px');
  expect(triggerStyle.fontSize).toBe('12px');

  await user.click(workspaceSelectTrigger);
  const forkWorktreeOption = page.getByRole('option', {
    name: /fork to worktree/i,
  });
  await expect.element(forkWorktreeOption).toBeVisible();
  await expect
    .element(page.getByRole('option', { name: /new worktree/i }))
    .not.toBeInTheDocument();
  const compactOptionStyle = getComputedStyle(forkWorktreeOption.element());
  const compactOptionIconStyle = getComputedStyle(
    forkWorktreeOption.element().querySelector('svg') as SVGElement
  );
  expect(compactOptionStyle.height).toBe('28px');
  expect(compactOptionStyle.fontSize).toBe('12px');
  expect(compactOptionStyle.lineHeight).toBe('16px');
  expect(compactOptionStyle.paddingTop).toBe('0px');
  expect(compactOptionStyle.columnGap).toBe('6px');
  expect(compactOptionIconStyle.width).toBe('16px');
  expect(compactOptionIconStyle.height).toBe('16px');

  await user.click(forkWorktreeOption);

  expect(onWorkerWorkspaceModeChange).toHaveBeenCalledWith('new-worktree');
});

test('closed Canvas controls do not reserve an invisible tab slot', async () => {
  const onWorkerWorkspaceModeChange = vi.fn();

  render(
    <MainTopbarWorkspaceHarness
      canvasAvailable
      onWorkerWorkspaceModeChange={onWorkerWorkspaceModeChange}
    />
  );

  const workspaceSelect = page
    .getByRole('combobox', {
      name: 'Worker workspace',
    })
    .element();
  const canvasToggle = page
    .getByRole('button', {
      name: 'Open Canvas side panel',
    })
    .element();

  const workspaceSelectRect = workspaceSelect.getBoundingClientRect();
  const canvasToggleRect = canvasToggle.getBoundingClientRect();

  expect(canvasToggleRect.left - workspaceSelectRect.right).toBe(12);
  await expect
    .element(page.getByRole('tab', { name: 'Files' }))
    .not.toBeInTheDocument();
});

test('open Canvas controls reserve the canvas pane tab slot', async () => {
  const onWorkerWorkspaceModeChange = vi.fn();

  document.documentElement.style.setProperty('--canvas-pane-width', '300px');
  try {
    render(
      <MainTopbarWorkspaceHarness
        canvasAvailable
        canvasOpen
        onWorkerWorkspaceModeChange={onWorkerWorkspaceModeChange}
      />
    );

    const filesTab = page.getByRole('tab', { name: 'Files' }).element();
    const tabSlot = filesTab.closest(
      '[style*="--canvas-pane-width"]'
    ) as HTMLElement | null;

    expect(tabSlot).not.toBeNull();
    expect(tabSlot?.getBoundingClientRect().width).toBe(248);
  } finally {
    document.documentElement.style.removeProperty('--canvas-pane-width');
  }
});

test('workspace select keeps new-worktree label outside selected worker scope', async () => {
  const user = setupUser();
  const onWorkerWorkspaceModeChange = vi.fn();

  render(
    <MainTopbarWorkspaceHarness
      onWorkerWorkspaceModeChange={onWorkerWorkspaceModeChange}
      selectedTerminalSession={{
        agent: 'codex',
        cwd: '/repo/app',
        description: '',
        id: 'orchestrator-1',
        issue: '',
        kind: 'orchestrator',
        metadata: JSON.stringify({ workspaceMode: 'local' }),
        project: 'app',
        recap: '',
        state: 'prompt',
        title: 'Orchestrator',
        workerId: 'orchestrator-1',
      }}
    />
  );

  await user.click(page.getByRole('combobox', { name: 'Worker workspace' }));

  await expect
    .element(page.getByRole('option', { name: /new worktree/i }))
    .toBeVisible();
  await expect
    .element(page.getByRole('option', { name: /fork to worktree/i }))
    .not.toBeInTheDocument();
});
