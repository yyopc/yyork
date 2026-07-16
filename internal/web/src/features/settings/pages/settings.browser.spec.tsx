import { expect, test, vi } from 'vitest';

import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from '@/features/home/pages/workspace-context';
import { page, render, setupUser } from '@/tests/utils';

import { SettingsPage } from './settings';

function createWorkspaceContextValue(
  onConfirmBeforeStoppingSessionsChange: (value: boolean) => void
): WorkspaceContextValue {
  return {
    canvasAvailable: false,
    canvasOpen: false,
    canvasResizing: false,
    canvasTab: 'files',
    canvasTarget: {},
    confirmBeforeStoppingSessions: true,
    firstRunProjectSetupPhase: 'empty',
    firstRunProjectSetupSelection: {
      orchestratorHarnessId: 'claude-code',
      rememberOrchestratorDefault: false,
      rememberWorkerDefault: false,
      workerHarnessId: 'codex',
    },
    hasProjects: false,
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
    onConfirmBeforeStoppingSessionsChange,
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
}

test('changes and persists the five global settings', async () => {
  const user = setupUser();
  const onConfirmBeforeStoppingSessionsChange = vi.fn();
  const previousValues = {
    agents: localStorage.getItem('yyork.home.agent-harness-defaults'),
    settings: localStorage.getItem('yyork.settings.preferences'),
    theme: localStorage.getItem('theme'),
  };

  localStorage.removeItem('yyork.home.agent-harness-defaults');
  localStorage.removeItem('yyork.settings.preferences');
  localStorage.setItem('theme', 'system');

  try {
    render(
      <WorkspaceContext
        value={createWorkspaceContextValue(
          onConfirmBeforeStoppingSessionsChange
        )}
      >
        <SettingsPage />
      </WorkspaceContext>
    );

    await expect
      .element(page.getByRole('heading', { level: 1, name: 'Settings' }))
      .toBeVisible();
    await expect
      .element(page.getByTestId('settings-page'))
      .toHaveClass('max-w-190');

    const themeSelect = page.getByRole('combobox', { name: 'Theme' });
    await user.click(themeSelect);
    const lightOption = page.getByRole('option', { name: 'Light' });
    await user.click(lightOption);
    expect(localStorage.getItem('theme')).toBe('light');
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'false');

    await user.click(themeSelect);
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(localStorage.getItem('theme')).not.toBe('light');
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'false');

    await user.click(themeSelect);
    await user.click(page.getByRole('option', { name: 'Dark' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(
      page.getByRole('combobox', { name: 'Default worker workspace' })
    );
    await user.click(page.getByRole('option', { name: 'New worktree' }));
    expect(
      JSON.parse(localStorage.getItem('yyork.settings.preferences') ?? '')
        .defaultWorkerWorkspaceMode
    ).toBe('new-worktree');

    await user.click(
      page.getByRole('switch', { name: 'Confirm before stopping sessions' })
    );
    expect(onConfirmBeforeStoppingSessionsChange).toHaveBeenCalledWith(false);

    await user.click(
      page.getByRole('combobox', { name: 'Default orchestrator' })
    );
    await user.click(page.getByRole('option', { name: 'Codex' }));

    await user.click(
      page.getByRole('combobox', { exact: true, name: 'Default worker' })
    );
    await user.click(page.getByRole('option', { name: 'Claude Code' }));

    expect(
      JSON.parse(
        localStorage.getItem('yyork.home.agent-harness-defaults') ?? ''
      )
    ).toMatchObject({
      orchestratorHarnessId: 'codex',
      workerHarnessId: 'claude-code',
    });
  } finally {
    for (const [key, value] of Object.entries({
      theme: previousValues.theme,
      'yyork.home.agent-harness-defaults': previousValues.agents,
      'yyork.settings.preferences': previousValues.settings,
    })) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  }
});
