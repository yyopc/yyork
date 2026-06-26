import { act } from 'react';
import { expect, test } from 'vitest';

import { page, render } from '@/tests/utils';

import { SidebarProvider, useSidebar } from './sidebar';

function SidebarShortcutHarness() {
  return (
    <SidebarProvider defaultOpen={false}>
      <SidebarState />
      <textarea aria-label="Terminal input" />
    </SidebarProvider>
  );
}

function SidebarState() {
  const { openMobile, state } = useSidebar();

  return (
    <div aria-label="Sidebar state" role="status">
      {state}:{openMobile ? 'mobile-open' : 'mobile-closed'}
    </div>
  );
}

function dispatchSidebarShortcut(options?: { shiftKey?: boolean }) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyB',
      key: 'b',
      metaKey: true,
      shiftKey: options?.shiftKey ?? false,
    })
  );
}

test('Mod+B toggles the sidebar while input focus is inside the app', async () => {
  render(<SidebarShortcutHarness />);

  const input = page.getByLabelText('Terminal input').element();
  input.focus();

  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .toHaveTextContent('collapsed:mobile-closed');

  act(() => dispatchSidebarShortcut());

  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .not.toHaveTextContent('collapsed:mobile-closed');
});

test('Mod+Shift+B does not toggle the sidebar while input focus is inside the app', async () => {
  render(<SidebarShortcutHarness />);

  const input = page.getByLabelText('Terminal input').element();
  input.focus();

  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .toHaveTextContent('collapsed:mobile-closed');

  act(() => dispatchSidebarShortcut({ shiftKey: true }));

  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .toHaveTextContent('collapsed:mobile-closed');
});
