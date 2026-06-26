import { expect, test, vi } from 'vitest';

import { sampleKanbanCards } from '@/features/home/demo/session-workspace.fixtures';
import { page, render, setupUser } from '@/tests/utils';

import { KanbanCard } from './kanban-card';

test('opens the shared session context menu on right click', async () => {
  const user = setupUser();
  const card = sampleKanbanCards.codex;
  const onSelect = vi.fn();
  const onMarkDone = vi.fn();
  const onRename = vi.fn();

  render(
    <KanbanCard
      card={card}
      onSelect={onSelect}
      onTerminalSessionDelete={() => {}}
      onTerminalSessionHide={() => {}}
      onTerminalSessionMarkDone={onMarkDone}
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
    .element(page.getByRole('img', { name: 'Response delivered' }))
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
    .element(page.getByRole('menuitem', { name: 'Open terminal' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Mark done' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Rename' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Hide from sidebar' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: 'Stop session' }))
    .toBeVisible();

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
    .element(page.getByRole('menuitem', { name: 'Open terminal' }))
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

  expect(page.getByRole('img', { name: 'Response seen' }).query()).toBeNull();
  expect(
    page.getByRole('img', { name: 'Response delivered' }).query()
  ).toBeNull();
});
