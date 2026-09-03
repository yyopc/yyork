# Canvas Files Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Pierre's native keyboard search in Canvas Files and protect opening/filtering, match navigation and selection, and Escape cancellation with real browser/component coverage.

**Architecture:** Keep search inside the existing `WorkspaceFileTree` organism and the existing `@pierre/trees` model. Add a colocated Vitest Browser Mode regression spec that uses the real Pierre React implementation while stubbing only the files HTTP boundary, then enable `search` and explicitly select `hide-non-matches`; do not add a yyork search component, state store, or style layer.

**Tech Stack:** React, TypeScript, `@pierre/trees` `1.0.0-beta.4`, TanStack Query, Vitest Browser Mode with Playwright, React Doctor, d3k.

## Global Constraints

- Approved source: `docs/superpowers/specs/2026-07-14-canvas-files-search-design.md`.
- Scope is Canvas Files only; do not enable search in the Review changed-files tree.
- Use Pierre's native search input and keyboard handling; do not add yyork-owned search UI, query persistence, keyboard interception, styling, or dependency changes.
- Preserve all unrelated dirty-checkout changes, including `docs/superpowers/plans/2026-07-14-vscode-terminal-scroll-parity.md`.
- Do not run the auto-fixing `lint` script against the shared dirty tree; use the non-mutating TypeScript check named below.
- Reuse the existing d3k runtime and managed browser at `https://yyork.localhost`; do not start a second dev stack and do not stop the session.
- Do not stage or commit changes.

---

### Task 1: Add and enable native Canvas Files search

**Files:**
- Create: `internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx`
- Modify: `internal/web/src/features/home/components/organisms/canvas-panel.tsx` in the existing `WorkspaceFileTree` `useFileTree` options

**Interfaces:**
- Consumes: `CanvasPanel`, the existing session-files HTTP contract, the shared browser-test `render` wrapper, and Pierre's existing `useFileTree`/`FileTree` keyboard contract.
- Produces: no new exported API; the existing model gains `search: true` and `fileTreeSearchMode: 'hide-non-matches'`, while file selection continues through the existing `onSelectedFilePathChange(path: string | null)` callback.

- [ ] **Step 1: Write all three browser regressions before changing production code**

Create `internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx` with the real Pierre implementation left unmocked:

```tsx
import { afterEach, expect, test, vi } from 'vitest';

import { queryClient } from '@/lib/tanstack-query/query-client';

import { page, render, setupUser } from '@/tests/utils';

import { CanvasPanel } from './canvas-panel';

const SESSION_ID = 'canvas-search';
const PROJECT_ID = 'yyork';
const FILE_PATHS = [
  'README.md',
  'src/zebra-alpha.ts',
  'src/zebra-beta.ts',
];

afterEach(() => {
  queryClient.clear();
  window.localStorage.removeItem('yyork.files.layout');
  window.localStorage.removeItem('yyork.files.view-mode');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  await user.keyboard('{ArrowDown}{ArrowUp}{ArrowDown}');
  expect(onSelectedFilePathChange).not.toHaveBeenCalled();

  await user.keyboard('{Enter}');

  await expect
    .element(page.getByPlaceholder('Search…'))
    .not.toBeVisible();
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
  await user.keyboard('{ArrowDown}{Escape}');

  await expect
    .element(page.getByPlaceholder('Search…'))
    .not.toBeVisible();
  expect(onSelectedFilePathChange).not.toHaveBeenCalled();
  await expect
    .element(page.getByLabelText('Selected file'))
    .toHaveTextContent('README.md');
});

function renderCanvas(
  onSelectedFilePathChange: (path: string | null) => void,
  selectedFilePath?: string
) {
  render(
    <CanvasPanel
      activeTab="files"
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
```

- [ ] **Step 2: Run the focused browser spec and confirm the RED state**

Run from the repository root:

```bash
pnpm --filter @yyork/web test:browser -- src/features/home/components/organisms/canvas-panel.browser.spec.tsx
```

Expected: FAIL because the focused alphanumeric key cannot open a `Search…` input while `canvas-panel.tsx` still passes `search: false`. Fix only test syntax or fixture errors until the failure is specifically the missing disabled search behavior; do not change production code before observing that failure.

- [ ] **Step 3: Apply the minimal production change**

In the existing `useFileTree` options inside `WorkspaceFileTree`, add the explicit mode beside the other behavior options and enable search:

```tsx
const { model } = useFileTree({
  dragAndDrop: false,
  fileTreeSearchMode: 'hide-non-matches',
  flattenEmptyDirectories: true,
  gitStatus: props.gitStatus,
  icons: {
    colored: false,
    set: 'standard',
  },
  initialExpansion: 2,
  initialSelectedPaths: persistedSelectedFilePath
    ? [persistedSelectedFilePath]
    : undefined,
  onSelectionChange: (selectedPaths) => {
    const nextSelectedFilePath =
      getSelectedFilePathFromSelection(selectedPaths);
    if (nextSelectedFilePath) {
      setSelectedFilePath(nextSelectedFilePath);
      props.onSelectedFilePathChange(nextSelectedFilePath);
    }
  },
  paths: props.paths,
  renaming: false,
  search: true,
  stickyFolders: true,
});
```

Do not add a new component, hook, state value, event handler, storage key, style, or change to the Review tree.

- [ ] **Step 4: Run the focused browser spec and confirm the GREEN state**

```bash
pnpm --filter @yyork/web test:browser -- src/features/home/components/organisms/canvas-panel.browser.spec.tsx
```

Expected: all three tests pass with the real Pierre search surface: the non-match is hidden, arrow navigation does not select until Enter, Enter updates the existing file preview, and Escape preserves the prior preview.

- [ ] **Step 5: Run non-mutating package and React quality checks**

Run:

```bash
pnpm --filter @yyork/web lint:ts
pnpm --filter @yyork/web test:ci
pnpm --filter @yyork/web build
pnpm --filter @yyork/web doctor
git diff --check -- internal/web/src/features/home/components/organisms/canvas-panel.tsx internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx
```

Expected: TypeScript, the complete web test suite, and both web builds pass; React Doctor reports no new diagnostic attributable to the two touched React files; the focused diff has no whitespace errors. Because the checkout already contains unrelated changes, classify any failure by touched-file overlap before changing anything outside this task.

- [ ] **Step 6: Verify all three flows in the existing d3k-managed real app**

First confirm the existing runtime boundary:

```bash
d3k status --json
```

Expected: `running` is `true`, `browserConnected` is `true`, and `appUrl` is `https://yyork.localhost`. If any condition is false, report the verification blocker instead of launching another runtime.

Use only the managed browser:

```bash
d3k agent-browser --require-d3k-browser open "https://yyork.localhost"
d3k agent-browser snapshot -i
```

From each fresh snapshot, use its returned element refs to open an existing yyork worker session, open the Canvas side panel if needed, select the Files tab, and focus a file-tree row. Re-snapshot after each DOM-changing action so refs are not reused. Then replay:

```bash
d3k agent-browser keyboard type "canvas"
d3k agent-browser press ArrowDown
d3k agent-browser press ArrowUp
d3k agent-browser press ArrowDown
d3k agent-browser press Enter
d3k agent-browser snapshot -i
```

Expected: Pierre's native search opens and hides unrelated paths; the arrows move match focus without changing the preview; Enter closes search and the preview header changes to the focused Canvas file.

Focus a tree row again, then verify cancellation:

```bash
d3k agent-browser keyboard type "terminal"
d3k agent-browser press ArrowDown
d3k agent-browser press Escape
d3k agent-browser snapshot -i
d3k errors --context
d3k logs --type browser -n 200
```

Expected: Escape closes search while the previously selected preview remains unchanged, and d3k reports no new browser/server errors caused by the interaction.

- [ ] **Step 7: Review the final scoped diff without staging or committing**

```bash
git status --short -- internal/web/src/features/home/components/organisms/canvas-panel.tsx internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx
git diff -- internal/web/src/features/home/components/organisms/canvas-panel.tsx internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx
```

Expected: the implementation diff contains one new focused browser spec and only the two approved Pierre option changes in production. Leave both files unstaged and uncommitted for review.
