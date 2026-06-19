import { expect, test } from 'vitest';

import { page, render } from '@/tests/utils';

import { CanvasMarkdownPreview } from './canvas-markdown-preview';

const sampleMarkdown = [
  '# Title',
  '',
  'A paragraph with **bold** and a [link](https://example.com).',
  '',
  '- first item',
  '- second item',
  '',
  '```ts',
  "const value = 'code';",
  '```',
  '',
  '| Column |',
  '| ------ |',
  '| Cell |',
].join('\n');

test('renders markdown source as formatted HTML', async () => {
  render(<CanvasMarkdownPreview content={sampleMarkdown} />);

  await expect
    .element(page.getByRole('heading', { level: 1, name: 'Title' }))
    .toBeVisible();
  await expect.element(page.getByText('bold')).toBeVisible();
  await expect.element(page.getByRole('listitem').first()).toBeVisible();
  await expect.element(page.getByRole('table')).toBeVisible();
});

test('renders fenced code blocks and highlights them with Shiki', async () => {
  render(<CanvasMarkdownPreview content={sampleMarkdown} />);

  // The raw code is shown immediately (before async highlighting resolves).
  await expect.element(page.getByText("const value = 'code';")).toBeVisible();

  // Pierre's shared Shiki highlighter eventually swaps in highlighted markup.
  await expect
    .poll(() => document.querySelector('.yyork-markdown-codeblock .shiki'), {
      timeout: 15_000,
    })
    .not.toBeNull();
});

test('opens links in a new tab safely', async () => {
  render(<CanvasMarkdownPreview content={sampleMarkdown} />);

  const link = page.getByRole('link', { name: 'link' });
  await expect.element(link).toHaveAttribute('target', '_blank');
  await expect.element(link).toHaveAttribute('rel', 'noreferrer noopener');
});

test('does not execute raw HTML embedded in the markdown source', async () => {
  render(
    <CanvasMarkdownPreview
      content={'Before <img src="x" onerror="window.__pwned = true"> after'}
    />
  );

  await expect.element(page.getByText(/Before/)).toBeVisible();
  expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  expect(document.querySelector('.yyork-markdown img')).toBeNull();
});
