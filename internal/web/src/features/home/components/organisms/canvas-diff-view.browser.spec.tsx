import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { queryClient } from '@/lib/tanstack-query/query-client';

import { page, render, setupUser } from '@/tests/utils';

import { CanvasDiffView } from './canvas-diff-view';

const codeViewScrollTo = vi.hoisted(() => vi.fn());

vi.mock('@pierre/diffs', () => ({
  getSingularPatch: (patch: string) => {
    const pathMatch = /^diff --git a\/.+ b\/(.+)$/m.exec(patch);
    return {
      patch,
      path: pathMatch?.[1] ?? 'unknown',
    };
  },
}));

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react');

  interface MockCodeViewItem {
    collapsed?: boolean;
    fileDiff: {
      patch: string;
      path: string;
    };
    id: string;
    type: 'diff';
  }

  interface MockCodeViewProps {
    className?: string;
    items: MockCodeViewItem[];
    renderHeaderMetadata?: (item: MockCodeViewItem) => ReactNode;
  }

  const CodeView = React.forwardRef(function CodeView(
    props: MockCodeViewProps,
    ref: React.Ref<{ scrollTo: typeof codeViewScrollTo }>
  ) {
    React.useImperativeHandle(ref, () => ({
      scrollTo: codeViewScrollTo,
    }));

    return (
      <div className={props.className} data-testid="code-view">
        {props.items.map((item) => (
          <div aria-label={`Diff for ${item.fileDiff.path}`} key={item.id}>
            <div data-diffs-header="metadata">
              {props.renderHeaderMetadata?.(item)}
            </div>
            {item.collapsed ? null : (
              <pre className="yyork-diff-viewer">{item.fileDiff.patch}</pre>
            )}
          </div>
        ))}
      </div>
    );
  });

  return { CodeView };
});

vi.mock('@pierre/trees/react', async () => {
  const React = await import('react');

  interface MockTreeOptions {
    initialSelectedPaths?: readonly string[];
    onSelectionChange?: (selectedPaths: readonly string[]) => void;
    paths: readonly string[];
  }

  interface MockTreeModel {
    getItem: (path: string) => MockTreeItem | null;
    paths: readonly string[];
    selectedPaths: readonly string[];
    selectPath: (path: string) => void;
    subscribe: () => () => void;
  }

  interface MockTreeItem {
    collapse: () => void;
    deselect: () => void;
    expand: () => void;
    focus: () => void;
    getPath: () => string;
    isDirectory: () => boolean;
    isExpanded: () => boolean;
    isFocused: () => boolean;
    isSelected: () => boolean;
    select: () => void;
    toggle: () => void;
    toggleSelect: () => void;
  }

  function useFileTree(options: MockTreeOptions) {
    const [selectedPaths, setSelectedPaths] = React.useState<readonly string[]>(
      () => options.initialSelectedPaths ?? []
    );
    const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
      () => new Set(getDirectoryPaths(options.paths))
    );
    const directoryPaths = getDirectoryPaths(options.paths);

    const selectPath = (path: string) => {
      setSelectedPaths([path]);
      options.onSelectionChange?.([path]);
    };

    const model: MockTreeModel = {
      getItem: (path) => {
        const isDirectory = directoryPaths.includes(path);
        if (!isDirectory && !options.paths.includes(path)) {
          return null;
        }

        return {
          collapse: () => {
            setExpandedPaths((current) => {
              const next = new Set(current);
              next.delete(path);
              return next;
            });
          },
          deselect: () => {
            setSelectedPaths([]);
          },
          expand: () => {
            setExpandedPaths((current) => new Set(current).add(path));
          },
          focus: () => undefined,
          getPath: () => path,
          isDirectory: () => isDirectory,
          isExpanded: () => expandedPaths.has(path),
          isFocused: () => false,
          isSelected: () => selectedPaths.includes(path),
          select: () => selectPath(path),
          toggle: () => undefined,
          toggleSelect: () => selectPath(path),
        };
      },
      paths: options.paths,
      selectedPaths,
      selectPath,
      subscribe: () => () => undefined,
    };

    return { model };
  }

  function FileTree(props: {
    'aria-label'?: string;
    className?: string;
    model: MockTreeModel;
  }) {
    return (
      <div
        aria-label={props['aria-label']}
        className={props.className}
        role="tree"
      >
        {props.model.paths.map((path) => (
          <button
            aria-selected={props.model.selectedPaths.includes(path)}
            key={path}
            onClick={() => props.model.selectPath(path)}
            role="treeitem"
            type="button"
          >
            {path}
          </button>
        ))}
      </div>
    );
  }

  function getDirectoryPaths(paths: readonly string[]): string[] {
    const directories = new Set<string>();
    for (const path of paths) {
      const segments = path.split('/');
      for (let index = 1; index < segments.length; index += 1) {
        directories.add(`${segments.slice(0, index).join('/')}/`);
      }
    }
    return Array.from(directories);
  }

  return { FileTree, useFileTree };
});

afterEach(() => {
  codeViewScrollTo.mockReset();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('renders a changed-file tree for renderable diff patches', async () => {
  stubDiffResponse(makeDiffResponse({ sessionId: 'review-tree' }));

  render(
    <CanvasDiffView
      active
      reviewPreferences={{ diffLayout: 'split', wrapLines: false }}
      onReviewPreferencesChange={() => undefined}
      target={{ projectId: 'project-a', sessionId: 'review-tree' }}
    />
  );

  await expect
    .element(page.getByRole('tree', { name: 'Changed files' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: /folders/ }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Hide file tree' }))
    .toBeVisible();
  const sessionDiff = document.querySelector(
    'section[aria-label="Session diff"]'
  );
  const changedFilesTreeShell = document.querySelector(
    'section[aria-label="Changed files"]'
  );
  expect(sessionDiff).not.toBeNull();
  expect(changedFilesTreeShell).not.toBeNull();
  expect(sessionDiff?.contains(changedFilesTreeShell)).toBe(false);
  await expect.element(page.getByText('Changed files')).not.toBeInTheDocument();
  await expect
    .element(page.getByText(/renderable diffs/))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('treeitem', { name: 'src/alpha.ts' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'src/components/beta.tsx' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('treeitem', { name: 'assets/logo.png' }))
    .not.toBeInTheDocument();
  const summarySpans = Array.from(
    document.querySelectorAll('p[aria-label="3 files · +3 -1"] span')
  );
  const additionSummary = summarySpans.find(
    (element) => element.textContent === '+3'
  );
  const deletionSummary = summarySpans.find(
    (element) => element.textContent === '-1'
  );
  expect(additionSummary).not.toBeUndefined();
  expect(deletionSummary).not.toBeUndefined();
  expect(additionSummary).toHaveClass(/color-positive/);
  expect(deletionSummary).toHaveClass(/color-negative/);
  await expect
    .element(page.getByRole('checkbox', { name: 'Viewed src/alpha.ts' }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole('checkbox', { name: 'Viewed src/components/beta.tsx' })
    )
    .toBeVisible();
  expect(document.querySelector('.yyork-diff-header-metadata')).toBeNull();
  expect(document.querySelector('.yyork-diff-code-view')).not.toBeNull();
  expect(document.querySelector('.yyork-diff-scroll-region')).toBeNull();
  expect(document.querySelector('.yyork-diff-virtualizer')).toBeNull();
  await expect
    .element(page.getByLabelText('Diff for src/alpha.ts'))
    .toBeVisible();
});

test('marking a changed file viewed collapses only that file patch', async () => {
  const user = setupUser();
  stubDiffResponse(makeDiffResponse({ sessionId: 'review-viewed-file' }));

  render(
    <CanvasDiffView
      active
      reviewPreferences={{ diffLayout: 'split', wrapLines: false }}
      onReviewPreferencesChange={() => undefined}
      target={{ projectId: 'project-a', sessionId: 'review-viewed-file' }}
    />
  );

  const alphaViewed = page.getByRole('checkbox', {
    name: 'Viewed src/alpha.ts',
  });
  await expect.element(alphaViewed).toBeVisible();
  await expect.element(page.getByText('-oldAlpha')).toBeVisible();
  await expect
    .element(page.getByText('+export function Beta() {'))
    .toBeVisible();

  await user.click(alphaViewed);

  await expect.element(alphaViewed).toHaveAttribute('aria-checked', 'true');
  await expect.element(page.getByText('-oldAlpha')).not.toBeInTheDocument();
  await expect
    .element(page.getByText('+export function Beta() {'))
    .toBeVisible();
  await expect
    .element(page.getByLabelText('Diff for src/alpha.ts'))
    .toBeVisible();

  await user.click(alphaViewed);

  await expect.element(alphaViewed).toHaveAttribute('aria-checked', 'false');
  await expect.element(page.getByText('-oldAlpha')).toBeVisible();
});

test('collapses and restores the changed-file tree from the review toolbar', async () => {
  const user = setupUser();
  stubDiffResponse(makeDiffResponse({ sessionId: 'review-tree-collapse' }));

  render(
    <CanvasDiffView
      active
      reviewPreferences={{ diffLayout: 'split', wrapLines: false }}
      onReviewPreferencesChange={() => undefined}
      target={{ projectId: 'project-a', sessionId: 'review-tree-collapse' }}
    />
  );

  await expect
    .element(page.getByRole('tree', { name: 'Changed files' }))
    .toBeVisible();

  await user.click(page.getByRole('button', { name: 'Hide file tree' }));

  await expect
    .element(page.getByRole('tree', { name: 'Changed files' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: /folders/ }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Show file tree' }))
    .toBeVisible();
  await expect
    .element(page.getByLabelText('Diff for src/components/beta.tsx'))
    .toBeVisible();
  const collapsedWorkspace = document.querySelector(
    '.yyork-diff-review-workspace--collapsed'
  );
  const sessionDiff = document.querySelector(
    'section[aria-label="Session diff"]'
  );
  expect(collapsedWorkspace).not.toBeNull();
  expect(sessionDiff).not.toBeNull();
  expect(Math.round(sessionDiff?.getBoundingClientRect().width ?? 0)).toBe(
    Math.round(collapsedWorkspace?.getBoundingClientRect().width ?? 0)
  );

  await user.click(page.getByRole('button', { name: 'Show file tree' }));

  await expect
    .element(page.getByRole('tree', { name: 'Changed files' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Hide file tree' }))
    .toBeVisible();
});

test('selecting a changed file jumps to that patch section', async () => {
  const user = setupUser();
  stubDiffResponse(makeDiffResponse({ sessionId: 'review-jump' }));

  render(
    <CanvasDiffView
      active
      reviewPreferences={{ diffLayout: 'split', wrapLines: false }}
      onReviewPreferencesChange={() => undefined}
      target={{ projectId: 'project-a', sessionId: 'review-jump' }}
    />
  );

  const betaTreeItem = page.getByRole('treeitem', {
    name: 'src/components/beta.tsx',
  });
  await expect.element(betaTreeItem).toBeVisible();

  await user.click(betaTreeItem);

  expect(codeViewScrollTo).toHaveBeenCalledWith({
    align: 'start',
    behavior: 'instant',
    id: 'src/components/beta.tsx:1',
    type: 'item',
  });
  await expect.element(betaTreeItem).toHaveAttribute('aria-selected', 'true');
});

test('keeps the no-text-hunks empty state without adding a tree', async () => {
  stubDiffResponse(
    makeDiffResponse({
      files: [
        {
          additions: 0,
          deletions: 0,
          path: 'assets/logo.png',
          status: 'modified',
        },
      ],
      patch: '',
      sessionId: 'review-empty',
    })
  );

  render(
    <CanvasDiffView
      active
      reviewPreferences={{ diffLayout: 'stacked', wrapLines: true }}
      onReviewPreferencesChange={() => undefined}
      target={{ projectId: 'project-a', sessionId: 'review-empty' }}
    />
  );

  await expect.element(page.getByText('No text hunks')).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Split' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Stacked' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Refresh diff' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: /folders/ }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Hide file tree' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Show file tree' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('tree', { name: 'Changed files' }))
    .not.toBeInTheDocument();
});

function stubDiffResponse(response: CanvasDiffResponse) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)));
}

interface CanvasDiffResponse {
  baseLabel: string;
  cwd: string;
  files: CanvasDiffResponseFile[];
  generatedAt: string;
  patch: string;
  patchTruncated?: boolean;
  target: {
    kind: 'session';
    projectId?: string;
    sessionId?: string;
  };
}

interface CanvasDiffResponseFile {
  additions: number;
  deletions: number;
  path: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked';
}

function makeDiffResponse(
  overrides: Partial<CanvasDiffResponse> & { sessionId: string }
): CanvasDiffResponse {
  return {
    baseLabel: 'HEAD',
    cwd: '/tmp/yyork-review',
    files: [
      {
        additions: 1,
        deletions: 1,
        path: 'src/alpha.ts',
        status: 'modified',
      },
      {
        additions: 2,
        deletions: 0,
        path: 'src/components/beta.tsx',
        status: 'added',
      },
      {
        additions: 0,
        deletions: 0,
        path: 'assets/logo.png',
        status: 'modified',
      },
    ],
    generatedAt: '2026-07-02T00:00:00Z',
    patch: [
      'diff --git a/src/alpha.ts b/src/alpha.ts',
      'index 1111111..2222222 100644',
      '--- a/src/alpha.ts',
      '+++ b/src/alpha.ts',
      '@@ -1 +1 @@',
      '-oldAlpha',
      '+newAlpha',
      'diff --git a/src/components/beta.tsx b/src/components/beta.tsx',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/src/components/beta.tsx',
      '@@ -0,0 +1,2 @@',
      '+export function Beta() {',
      '+  return null;',
    ].join('\n'),
    target: {
      kind: 'session',
      projectId: 'project-a',
      sessionId: overrides.sessionId,
    },
    ...overrides,
  };
}
