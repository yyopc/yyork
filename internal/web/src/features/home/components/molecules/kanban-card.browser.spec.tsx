import { expect, test, vi } from 'vitest';

import { sampleKanbanCards } from '@/features/home/demo/session-workspace.fixtures';
import { page, render, setupUser } from '@/tests/utils';

import { KanbanCard } from './kanban-card';

test('opens the shared session context menu on right click', async () => {
  const user = setupUser();
  const card = sampleKanbanCards.codex;
  const onSelect = vi.fn();
  const onOpenDetached = vi.fn();
  const onMarkDone = vi.fn();
  const onRename = vi.fn();

  render(
    <KanbanCard
      card={card}
      onSelect={onSelect}
      onTerminalSessionDelete={() => {}}
      onTerminalSessionHide={() => {}}
      onTerminalSessionMarkDone={onMarkDone}
      onTerminalSessionOpenDetached={onOpenDetached}
      onTerminalSessionPinToggle={() => {}}
      onTerminalSessionRename={onRename}
      pinnedTerminalSessionKeys={[card.selectionKey]}
    />
  );

  const cardButton = page.getByRole('button', {
    name: /Codex session .*: Split PR decision/i,
  });

  await user.click(cardButton);
  expect(onSelect).toHaveBeenCalledWith(card.selectionKey);
  onSelect.mockClear();
  await expect
    .element(page.getByRole('button', { name: /Response delivered/ }))
    .toBeVisible();

  cardButton.element().dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );

  await expect
    .element(page.getByRole('menuitem', { name: 'Unpin' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { exact: true, name: 'Open terminal' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Detach terminal' }))
    .toBeVisible();
  const compactMenuItemStyle = getComputedStyle(
    page.getByRole('menuitem', { name: 'Detach terminal' }).element()
  );
  const compactMenuIconStyle = getComputedStyle(
    page
      .getByRole('menuitem', { name: 'Detach terminal' })
      .element()
      .querySelector('svg') as SVGElement
  );
  expect(compactMenuItemStyle.fontSize).toBe('14px');
  expect(compactMenuItemStyle.lineHeight).toBe('20px');
  expect(compactMenuItemStyle.paddingTop).toBe('4px');
  expect(compactMenuItemStyle.columnGap).toBe('6px');
  expect(compactMenuIconStyle.width).toBe('16px');
  expect(compactMenuIconStyle.height).toBe('16px');
  await expect
    .element(page.getByRole('menuitem', { name: 'Mark done' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Rename' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Hide from sidebar' }))
    .toBeVisible();
  const stopSessionItem = page.getByRole('menuitem', {
    name: 'Stop session',
  });
  await expect.element(stopSessionItem).toBeVisible();
  const menuSeparator = document.querySelector(
    '[data-slot="context-menu-separator"]'
  ) as HTMLElement;
  expect(getComputedStyle(menuSeparator).marginBottom).toBe('4px');
  expect(
    Math.round(
      stopSessionItem.element().getBoundingClientRect().top -
        menuSeparator.getBoundingClientRect().bottom
    )
  ).toBe(4);
  expect(stopSessionItem.element().className).toContain(
    'data-[variant=destructive]:focus:bg-destructive/10'
  );
  expect(stopSessionItem.element().className).toContain(
    'dark:data-[variant=destructive]:focus:bg-destructive/20'
  );

  await user.click(page.getByRole('menuitem', { name: 'Rename' }));

  expect(onSelect).not.toHaveBeenCalled();
  expect(onRename).toHaveBeenCalledWith(card.selectionKey, card.task);

  cardButton.element().dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );
  await user.click(page.getByRole('menuitem', { name: 'Detach terminal' }));
  expect(onOpenDetached).toHaveBeenCalledWith(card.selectionKey);
  expect(onSelect).not.toHaveBeenCalled();

  cardButton.element().dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );
  await user.click(page.getByRole('menuitem', { name: 'Mark done' }));
  expect(onMarkDone).toHaveBeenCalledWith(card.selectionKey, card.task);
});

test('hides mark done for non-prompt cards', async () => {
  const card = sampleKanbanCards.selectedCodex;

  render(
    <KanbanCard
      card={card}
      onSelect={() => {}}
      onTerminalSessionMarkDone={() => {}}
    />
  );

  page
    .getByRole('button', {
      name: /Codex session .*: Tell me about this project/i,
    })
    .element()
    .dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        buttons: 2,
        cancelable: true,
      })
    );

  await expect
    .element(page.getByRole('menuitem', { exact: true, name: 'Open terminal' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Detach terminal' }))
    .toBeVisible();
  expect(page.getByRole('menuitem', { name: 'Mark done' }).query()).toBeNull();
});

test('renders no attention icon for attended prompt responses', () => {
  render(
    <KanbanCard
      card={{
        ...sampleKanbanCards.codex,
        responseAttention: {
          deliveredAt: '2026-06-07T10:18:00.000Z',
          label: 'Response seen',
          status: 'seen',
        },
      }}
    />
  );

  expect(
    document.querySelector('[role="img"][aria-label^="Response"]')
  ).toBeNull();
});
