import { expect, test } from 'vitest';

import { sampleAgentHarnesses } from '@/features/home/demo/agent-harness.fixtures';
import type { AgentHarnessId } from '@/features/home/domain/agent-harness';
import { page, render, setupUser } from '@/tests/utils';

import { ProjectSetupHarnessPicker } from './project-setup-harness-picker';

function renderPicker(overrides?: {
  orchestratorHarnessId?: AgentHarnessId;
  workerHarnessId?: AgentHarnessId;
}) {
  render(
    <ProjectSetupHarnessPicker
      harnesses={sampleAgentHarnesses}
      projectPath="~/Projects/yyork"
      orchestratorHarnessId={overrides?.orchestratorHarnessId ?? 'claude-code'}
      workerHarnessId={overrides?.workerHarnessId ?? 'codex'}
      rememberOrchestratorDefault={false}
      rememberWorkerDefault={false}
      onOrchestratorChange={() => {}}
      onWorkerChange={() => {}}
      onRememberOrchestratorDefaultChange={() => {}}
      onRememberWorkerDefaultChange={() => {}}
      onStartProject={() => {}}
    />
  );
}

test('offers Cursor alongside the installed harnesses', async () => {
  const user = setupUser();
  renderPicker();

  await user.click(page.getByRole('combobox').first());

  const cursorOption = page.getByRole('option', { name: 'Cursor' });
  await expect.element(cursorOption).toBeVisible();
  // The harness icon is decorative (empty alt), so it is not reachable by role.
  expect(cursorOption.element().querySelector('img')).toHaveAttribute(
    'src',
    '/agent-icons/cursor-agent.svg'
  );
  await expect.element(cursorOption).toHaveAttribute('aria-disabled', 'true');
});

test('blocks starting a project on an unavailable harness', async () => {
  renderPicker({ orchestratorHarnessId: 'cursor' });

  await expect
    .element(page.getByRole('button', { name: 'Start project' }))
    .toBeDisabled();
});
