import { expect, test } from '@playwright/test';

test('persists every global setting across navigation and reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem('theme');
    localStorage.removeItem('yyork.home.agent-harness-defaults');
    localStorage.removeItem('yyork.home.workspace-preferences');
    localStorage.removeItem('yyork.settings.preferences');
  });

  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await page.getByRole('combobox', { name: 'Theme' }).click();
  await page.getByRole('option', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page
    .getByRole('combobox', { name: 'Default worker workspace' })
    .click();
  await page.getByRole('option', { name: 'New worktree' }).click();

  const confirmSwitch = page.getByRole('switch', {
    name: 'Confirm before stopping sessions',
  });
  await confirmSwitch.click();
  await expect(confirmSwitch).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('combobox', { name: 'Default orchestrator' }).click();
  await page.getByRole('option', { name: 'Codex' }).click();

  await page
    .getByRole('combobox', { exact: true, name: 'Default worker' })
    .click();
  await page.getByRole('option', { name: 'Claude Code' }).click();

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(
    page.getByRole('combobox', { name: 'Default worker workspace' })
  ).toContainText('New worktree');
  await expect(
    page.getByRole('switch', { name: 'Confirm before stopping sessions' })
  ).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByRole('combobox', { name: 'Default orchestrator' })
  ).toContainText('Codex');
  await expect(
    page.getByRole('combobox', { exact: true, name: 'Default worker' })
  ).toContainText('Claude Code');
});
