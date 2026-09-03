import { expect, test, vi } from 'vitest';

import { page, render, setupUser } from '@/tests/utils';

import { SettingsAgentSelect } from './settings-agent-select';

function renderSelect(onValueChange = vi.fn()) {
  render(
    <SettingsAgentSelect
      label="Default orchestrator"
      testId="default-orchestrator"
      value="claude-code"
      onValueChange={onValueChange}
    />
  );

  return onValueChange;
}

test('lists every registered agent harness', async () => {
  const user = setupUser();
  renderSelect();

  await user.click(page.getByTestId('default-orchestrator'));

  await expect
    .element(page.getByRole('option', { name: 'Claude Code' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('option', { name: 'Codex' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('option', { name: 'Cursor' }))
    .toBeVisible();
});

test('marks a harness without a backing plugin as unavailable', async () => {
  const user = setupUser();
  renderSelect();

  await user.click(page.getByTestId('default-orchestrator'));

  await expect
    .element(page.getByRole('option', { name: 'Cursor' }))
    .toHaveAttribute('aria-disabled', 'true');
  await expect
    .element(page.getByRole('option', { name: 'Codex' }))
    .not.toHaveAttribute('aria-disabled');
});
