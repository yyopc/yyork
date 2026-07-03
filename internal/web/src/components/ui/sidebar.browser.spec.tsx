import { act, useState } from 'react';
import { expect, test, vi } from 'vitest';

import { page, render } from '@/tests/utils';

import { Sidebar, SidebarProvider, SidebarRail, useSidebar } from './sidebar';

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
    <output aria-label="Sidebar state">
      {state}:{openMobile ? 'mobile-open' : 'mobile-closed'}
    </output>
  );
}

function SidebarResizeHarness(props: {
  initialWidth?: number;
  onWidthChange?: (width: number) => void;
}) {
  const [width, setWidth] = useState(props.initialWidth ?? 256);

  return (
    <SidebarProvider
      defaultOpen
      width={width}
      onWidthChange={(nextWidth) => {
        setWidth(nextWidth);
        props.onWidthChange?.(nextWidth);
      }}
    >
      <Sidebar collapsible="offcanvas">
        <div>Resizable sidebar content</div>
        <SidebarRail />
      </Sidebar>
      <SidebarState />
      <output aria-label="Sidebar width">{width}</output>
    </SidebarProvider>
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

function getSidebarRail() {
  const rail = document.querySelector<HTMLButtonElement>(
    '[data-sidebar="rail"]'
  );

  expect(rail).toBeTruthy();
  return rail as HTMLButtonElement;
}

function dispatchRailPointer(
  rail: HTMLButtonElement,
  type: string,
  clientX: number
) {
  rail.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX,
      pointerId: 1,
      pointerType: 'mouse',
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

test('dragging the rail resizes the expanded sidebar and clamps width', async () => {
  await page.viewport(1024, 768);
  const onWidthChange = vi.fn();
  render(<SidebarResizeHarness onWidthChange={onWidthChange} />);
  const rail = getSidebarRail();

  act(() => {
    dispatchRailPointer(rail, 'pointerdown', 256);
    dispatchRailPointer(rail, 'pointermove', 326);
    dispatchRailPointer(rail, 'pointerup', 326);
    rail.click();
  });

  await expect
    .element(page.getByLabelText('Sidebar width'))
    .toHaveTextContent('326');
  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .toHaveTextContent('expanded:mobile-closed');
  expect(onWidthChange).toHaveBeenLastCalledWith(326);

  act(() => {
    dispatchRailPointer(rail, 'pointerdown', 326);
    dispatchRailPointer(rail, 'pointermove', 40);
    dispatchRailPointer(rail, 'pointerup', 40);
  });

  await expect
    .element(page.getByLabelText('Sidebar width'))
    .toHaveTextContent('208');
  expect(onWidthChange).toHaveBeenLastCalledWith(208);

  act(() => {
    dispatchRailPointer(rail, 'pointerdown', 208);
    dispatchRailPointer(rail, 'pointermove', 800);
    dispatchRailPointer(rail, 'pointerup', 800);
  });

  await expect
    .element(page.getByLabelText('Sidebar width'))
    .toHaveTextContent('420');
  expect(onWidthChange).toHaveBeenLastCalledWith(420);
});

test('clicking the rail still toggles the sidebar when it is not dragged', async () => {
  await page.viewport(1024, 768);
  render(<SidebarResizeHarness />);

  act(() => {
    getSidebarRail().click();
  });

  await expect
    .element(page.getByRole('status', { name: 'Sidebar state' }))
    .toHaveTextContent('collapsed:mobile-closed');
});
