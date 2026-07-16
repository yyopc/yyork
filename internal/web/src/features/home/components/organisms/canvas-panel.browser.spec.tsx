import { afterEach, expect, test, vi } from 'vitest';

import { queryClient } from '@/lib/tanstack-query/query-client';

import { page, render, setupUser } from '@/tests/utils';

import { CanvasPanel, type CanvasTab } from './canvas-panel';

const SESSION_ID = 'canvas-search';
const PROJECT_ID = 'yyork';
const FILE_PATHS = ['README.md', 'src/zebra-alpha.ts', 'src/zebra-beta.ts'];

afterEach(() => {
  queryClient.clear();
  window.localStorage.removeItem('yyork.files.layout');
  window.localStorage.removeItem('yyork.files.view-mode');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('renders the workspace tree with its directories collapsed by default', async () => {
  stubCanvasFiles();
  renderCanvas(vi.fn());
  const user = setupUser();

  await expect
    .element(page.getByLabelText('Workspace file tree'))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'README.md' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'src' }))
    .toHaveAttribute('aria-expanded', 'false');
  await expect
    .element(page.getByRole('treeitem', { name: 'zebra-alpha.ts' }))
    .not.toBeInTheDocument();

  await user.click(page.getByRole('button', { name: 'Hide file tree' }));

  await expect
    .element(page.getByLabelText('Workspace file tree'))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Show file tree' }))
    .toBeVisible();

  await user.click(page.getByRole('button', { name: 'Show file tree' }));

  await expect
    .element(page.getByRole('treeitem', { name: 'src' }))
    .toHaveAttribute('aria-expanded', 'false');
});

test('returns to an open tree with collapsed directories after the Files tab remounts', async () => {
  stubCanvasFiles();
  const onSelectedFilePathChange = vi.fn();
  const { rerender } = await renderCanvas(onSelectedFilePathChange);
  const user = setupUser();

  const sourceDirectory = page.getByRole('treeitem', { name: 'src' });
  await expect.element(sourceDirectory).toBeVisible();
  (sourceDirectory.element() as HTMLElement).focus();
  await user.keyboard('{ArrowRight}');
  await expect
    .element(page.getByRole('treeitem', { name: 'zebra-alpha.ts' }))
    .toBeVisible();

  await rerender(getCanvasPanel(onSelectedFilePathChange, undefined, 'review'));
  await expect
    .element(page.getByRole('button', { name: 'Hide file tree' }))
    .not.toBeInTheDocument();

  await rerender(getCanvasPanel(onSelectedFilePathChange));

  await expect
    .element(page.getByLabelText('Workspace file tree'))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'src' }))
    .toHaveAttribute('aria-expanded', 'false');
  await expect
    .element(page.getByRole('treeitem', { name: 'zebra-alpha.ts' }))
    .not.toBeInTheDocument();
});

test('opens native search from the focused tree and hides non-matches', async () => {
  stubCanvasFiles();
  renderCanvas(vi.fn());
  const user = setupUser();

  await focusWorkspaceTree();
  await user.keyboard('z');

  await expect.element(page.getByPlaceholder('Search…')).toHaveValue('z');
  await expect
    .element(page.getByRole('treeitem', { name: 'zebra-alpha.ts' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'zebra-beta.ts' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'README.md' }))
    .not.toBeInTheDocument();
});

test('navigates matches and selects the focused file with Enter', async () => {
  stubCanvasFiles();
  const onSelectedFilePathChange = vi.fn();
  renderCanvas(onSelectedFilePathChange);
  const user = setupUser();

  await focusWorkspaceTree();
  await user.keyboard('z');
  await expect.element(page.getByPlaceholder('Search…')).toHaveValue('z');
  await user.keyboard('{ArrowDown}{ArrowUp}{ArrowDown}');

  expect(onSelectedFilePathChange).not.toHaveBeenCalled();

  await user.keyboard('{Enter}');

  await expect.element(page.getByPlaceholder('Search…')).toHaveValue('');
  expect(onSelectedFilePathChange).toHaveBeenLastCalledWith(
    'src/zebra-beta.ts'
  );
  await expect
    .element(page.getByLabelText('Selected file'))
    .toHaveTextContent('src/zebra-beta.ts');
});

test('closes search with Escape without changing the selected file', async () => {
  stubCanvasFiles();
  const onSelectedFilePathChange = vi.fn();
  renderCanvas(onSelectedFilePathChange, 'README.md');
  const user = setupUser();

  await focusWorkspaceTree();
  await user.keyboard('z');
  await expect.element(page.getByPlaceholder('Search…')).toHaveValue('z');
  await user.keyboard('{ArrowDown}{Escape}');

  await expect.element(page.getByPlaceholder('Search…')).toHaveValue('');
  expect(onSelectedFilePathChange).not.toHaveBeenCalled();
  await expect
    .element(page.getByLabelText('Selected file'))
    .toHaveTextContent('README.md');
});

function renderCanvas(
  onSelectedFilePathChange: (path: string | null) => void,
  selectedFilePath?: string
) {
  return render(getCanvasPanel(onSelectedFilePathChange, selectedFilePath));
}

function getCanvasPanel(
  onSelectedFilePathChange: (path: string | null) => void,
  selectedFilePath?: string,
  activeTab: CanvasTab = 'files'
) {
  return (
    <CanvasPanel
      activeTab={activeTab}
      onPreviewUrlChange={() => undefined}
      onReviewPreferencesChange={() => undefined}
      onSelectedFilePathChange={onSelectedFilePathChange}
      onTabChange={() => undefined}
      selectedFilePath={selectedFilePath}
      target={{ projectId: PROJECT_ID, sessionId: SESSION_ID }}
    />
  );
}

async function focusWorkspaceTree() {
  const treeItem = page.getByRole('treeitem', { name: 'README.md' });
  await expect.element(treeItem).toBeVisible();
  (treeItem.element() as HTMLElement).focus();
}

function stubCanvasFiles() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      const filesPath = `/api/sessions/${SESSION_ID}/files`;

      if (url.pathname === filesPath) {
        return Response.json({
          gitStatus: [],
          paths: FILE_PATHS,
          truncated: false,
          workspacePath: '/tmp/yyork',
        });
      }

      if (url.pathname === `${filesPath}/content`) {
        const path = url.searchParams.get('path') ?? '';
        const contents = `Selected ${path}`;
        return Response.json({
          binary: false,
          contents,
          path,
          size: contents.length,
          truncated: false,
          workspacePath: '/tmp/yyork',
        });
      }

      return Response.json({ error: 'Unexpected request' }, { status: 404 });
    })
  );
}
