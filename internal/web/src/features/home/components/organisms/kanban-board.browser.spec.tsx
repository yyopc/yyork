import { expect, test, vi } from 'vitest';

import { sampleKanbanColumns } from '@/features/home/demo/session-workspace.fixtures';
import { page, render } from '@/tests/utils';

import { KanbanBoard } from './kanban-board';

function getBoardViewport() {
  const board = document.querySelector<HTMLElement>(
    '[aria-label="Kanban board"]'
  );

  if (!board) {
    throw new Error('Expected Kanban board to render.');
  }

  const viewport = board.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]'
  );

  expect(viewport).toBeTruthy();
  return viewport as HTMLElement;
}

function getVisibleInlineWidth(element: HTMLElement, viewport: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();

  return (
    Math.min(elementRect.right, viewportRect.right) -
    Math.max(elementRect.left, viewportRect.left)
  );
}

test('scrolls horizontally to the done column in a constrained desktop panel', async () => {
  await page.viewport(1440, 800);

  render(
    <div className="h-[520px] w-[720px] overflow-hidden border border-border bg-background">
      <KanbanBoard className="h-full" columns={sampleKanbanColumns} />
    </div>
  );

  const viewport = getBoardViewport();
  const doneHeading = page
    .getByRole('heading', { name: 'Done' })
    .element() as HTMLElement;

  await vi.waitFor(() => {
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
  });

  expect(getVisibleInlineWidth(doneHeading, viewport)).toBeLessThan(1);

  viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
  viewport.dispatchEvent(new Event('scroll', { bubbles: true }));

  await vi.waitFor(() => {
    expect(getVisibleInlineWidth(doneHeading, viewport)).toBeGreaterThan(20);
  });
});
