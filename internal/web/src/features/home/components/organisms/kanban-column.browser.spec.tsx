import { expect, test, vi } from 'vitest';

import { sampleKanbanCards } from '@/features/home/demo/session-workspace.fixtures';
import type { KanbanColumnData } from '@/features/home/domain/session-workspace';
import { page, render } from '@/tests/utils';

import { KanbanColumn } from './kanban-column';

const overflowColumn = {
  cards: Array.from({ length: 10 }, (_, index) => ({
    ...sampleKanbanCards.codex,
    id: `${sampleKanbanCards.codex.id}-overflow-${index}`,
    selectionKey: `${sampleKanbanCards.codex.selectionKey}-overflow-${index}`,
    shortId: `k${index.toString(36).padStart(4, '0')}`,
    task: `Investigate scroll fade affordance ${index + 1}`,
  })),
  id: 'prompt',
  title: 'Prompt',
} satisfies KanbanColumnData;

function getColumnScroller() {
  const column = document.querySelector<HTMLElement>(
    '[aria-label="Prompt column"]'
  );

  if (!column) {
    throw new Error('Expected Prompt column to render.');
  }

  const scroller = column.querySelector<HTMLElement>('.scroll-fade-y');

  expect(scroller).toBeTruthy();
  return scroller as HTMLElement;
}

function hasActiveMaskImage(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const maskImages = [
    styles.maskImage,
    styles.getPropertyValue('-webkit-mask-image'),
  ].filter(Boolean);

  return maskImages.some(
    (maskImage) => maskImage !== 'none' && maskImage.includes('gradient')
  );
}

test('uses the scroll fade affordance on overflowing kanban columns', async () => {
  await page.viewport(1024, 640);
  render(
    <div className="grid h-80 w-72 border border-border bg-background">
      <KanbanColumn column={overflowColumn} />
    </div>
  );

  const scroller = getColumnScroller();
  await expect
    .element(page.getByRole('heading', { name: 'Prompt' }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole('button', {
        name: /Codex session k0000: Investigate scroll fade affordance 1\./,
      })
    )
    .toBeVisible();
  await vi.waitFor(() => {
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(hasActiveMaskImage(scroller)).toBe(true);
  });

  expect(scroller.classList.contains('scroll-fade-y')).toBe(true);
  expect(scroller.classList.contains('scroll-fade-6')).toBe(true);
  expect(
    scroller.classList.contains('[--scroll-fade-reveal:calc(var(--spacing)*6)]')
  ).toBe(true);
});
