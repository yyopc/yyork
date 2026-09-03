import { expect, test } from 'vitest';

import { page, render } from '@/tests/utils';

import { ToolCallBulletinLine } from './tool-call-bulletin-line';

test('renders the active tool call as stable shimmer text', async () => {
  render(<ToolCallBulletinLine text="Read · hooks.go" />);

  const toolCallText = page.getByText('Read · hooks.go').element();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  expect(toolCallText.textContent).toBe('Read · hooks.go');
  expect(toolCallText.className).toContain('tool-call-bulletin-shimmer');
  await expect
    .poll(() => getComputedStyle(toolCallText).animationName)
    .toBe(reducedMotion ? 'none' : 'tool-call-bulletin-shimmer');
  expect(getComputedStyle(toolCallText).animationDuration).toBe(
    reducedMotion ? '0s' : '2.4s'
  );
});
