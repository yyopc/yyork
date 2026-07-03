import { type FileDiffMetadata,getSingularPatch } from '@pierre/diffs';
import type {
  CodeViewHandle,
  CodeViewItem,
  CodeViewProps,
} from '@pierre/diffs/react';
import { CodeView } from '@pierre/diffs/react';
import type { FileTree as FileTreeModel, GitStatusEntry } from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import { useQuery } from '@tanstack/react-query';
import {
  Columns2Icon,
  FileDiffIcon,
  RefreshCwIcon,
  Rows3Icon,
  WrapTextIcon,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Spinner } from '@/components/ui/spinner';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  FileTreeExpansionToggle,
  FileTreeSidebarToggle,
  getFileTreeDirectoryPaths,
  getSelectedFilePathFromSelection,
  useFileTreeExpansionState,
} from '@/features/home/components/molecules/canvas-file-tree-controls';
import {
  type CanvasDiffSnapshot,
  sessionCanvasDiffQueryOptions,
} from '@/features/home/data/canvas-diff';
import type {
  HomeWorkspaceCanvasReviewDiffLayout,
  HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';

type CanvasDiffLayout = HomeWorkspaceCanvasReviewDiffLayout;
type CanvasCodeViewOptions = NonNullable<CodeViewProps<undefined>['options']>;
type CanvasDiffFile = CanvasDiffSnapshot['files'][number];

const REVIEW_DIFF_PANEL_ID = 'review-diff';
const REVIEW_FILE_TREE_PANEL_ID = 'review-file-tree';
const REVIEW_DIFF_DEFAULT_SIZE = 72;
const REVIEW_DIFF_MIN_SIZE = '52%';
const REVIEW_FILE_TREE_DEFAULT_SIZE = 28;
const REVIEW_FILE_TREE_MIN_SIZE = '18%';
const REVIEW_FILE_TREE_MAX_SIZE = '42%';
const CANVAS_DIFF_HEADER_UNSAFE_CSS = `
[data-diffs-header='default'] [data-metadata] {
  position: sticky;
  right: 1rem;
  z-index: 3;
  flex-shrink: 0;
  padding-left: var(--diffs-gap-inline, var(--diffs-gap-fallback));
  background: var(--diffs-bg);
}
`;

interface CanvasDiffTarget {
  cwd?: string;
  projectId?: string;
  sessionId?: string;
}

export function CanvasDiffView(props: {
  active: boolean;
  reviewPreferences?: HomeWorkspaceCanvasReviewPreferences;
  onReviewPreferencesChange: (
    preferences: HomeWorkspaceCanvasReviewPreferences
  ) => void;
  target: CanvasDiffTarget;
}) {
  const layout = props.reviewPreferences?.diffLayout ?? 'split';
  const wrapLines = props.reviewPreferences?.wrapLines ?? false;
  const {
    data: diffSnapshot,
    error: diffError,
    isError: diffIsError,
    isFetching: diffIsFetching,
    isPending: diffIsPending,
    refetch: refetchDiff,
  } = useQuery(
    sessionCanvasDiffQueryOptions({
      enabled: props.active,
      projectId: props.target.projectId,
      sessionId: props.target.sessionId,
    })
  );
  const diffOptions: CanvasCodeViewOptions = {
    collapsedContextThreshold: 3,
    diffIndicators: 'bars',
    diffStyle: layout === 'split' ? 'split' : 'unified',
    hunkSeparators: 'line-info',
    lineDiffType: 'word',
    overflow: wrapLines ? 'wrap' : 'scroll',
    stickyHeaders: true,
    theme: {
      dark: 'pierre-dark',
      light: 'pierre-light',
    },
    unsafeCSS: CANVAS_DIFF_HEADER_UNSAFE_CSS,
  };
  const handleLayoutChange = (diffLayout: CanvasDiffLayout) => {
    props.onReviewPreferencesChange({
      ...props.reviewPreferences,
      diffLayout,
    });
  };
  const handleWrapLinesChange = (nextWrapLines: boolean) => {
    props.onReviewPreferencesChange({
      ...props.reviewPreferences,
      wrapLines: nextWrapLines,
    });
  };

  if (!props.target.sessionId) {
    return (
      <CanvasDiffPlaceholder
        centered
        title="No session selected"
        detail={
          props.target.cwd ?? 'Select a worker session to review changes.'
        }
      />
    );
  }

  if (diffIsPending) {
    return (
      <CanvasDiffPlaceholder
        centered
        title="Loading diff"
        detail={props.target.cwd ?? 'Reading the selected worktree.'}
      />
    );
  }

  if (diffIsError) {
    return (
      <CanvasDiffPlaceholder
        centered
        title="Unable to load diff"
        detail={
          diffError instanceof Error
            ? diffError.message
            : 'The selected worktree diff could not be loaded.'
        }
      />
    );
  }

  if (diffSnapshot.patchTruncated) {
    return (
      <CanvasDiffShell
        layout={layout}
        snapshot={diffSnapshot}
        wrapLines={wrapLines}
        isRefreshing={diffIsFetching}
        onLayoutChange={handleLayoutChange}
        onRefresh={() => void refetchDiff()}
        onWrapLinesChange={handleWrapLinesChange}
      >
        <CanvasDiffPlaceholder
          centered
          title="Patch too large"
          detail="Open this session in an IDE to review the full diff."
        />
      </CanvasDiffShell>
    );
  }

  if (diffSnapshot.patch.trim() === '') {
    return (
      <CanvasDiffShell
        layout={layout}
        snapshot={diffSnapshot}
        wrapLines={wrapLines}
        isRefreshing={diffIsFetching}
        onLayoutChange={handleLayoutChange}
        onRefresh={() => void refetchDiff()}
        onWrapLinesChange={handleWrapLinesChange}
      >
        <CanvasDiffPlaceholder
          centered
          detail={
            diffSnapshot.files.length === 0
              ? diffSnapshot.cwd
              : 'The changed files do not have renderable text hunks.'
          }
          icon={
            diffSnapshot.files.length === 0 ? (
              <FileDiffIcon
                aria-hidden="true"
                className="size-10 text-muted-foreground"
              />
            ) : undefined
          }
          title={
            diffSnapshot.files.length === 0 ? 'No changes' : 'No text hunks'
          }
        />
      </CanvasDiffShell>
    );
  }

  const filePatches = getCanvasDiffFilePatches(diffSnapshot);

  return (
    <CanvasDiffReviewShell
      key={getCanvasDiffReviewKey(filePatches)}
      diffOptions={diffOptions}
      filePatches={filePatches}
      layout={layout}
      snapshot={diffSnapshot}
      wrapLines={wrapLines}
      isRefreshing={diffIsFetching}
      onLayoutChange={handleLayoutChange}
      onRefresh={() => void refetchDiff()}
      onWrapLinesChange={handleWrapLinesChange}
    />
  );
}

interface CanvasDiffFilePatch {
  file?: CanvasDiffFile;
  fileDiff: FileDiffMetadata;
  key: string;
  patch: string;
  path: string;
  treePath?: string;
}

function getCanvasDiffFilePatches(
  snapshot: CanvasDiffSnapshot
): CanvasDiffFilePatch[] {
  const filePatches: CanvasDiffFilePatch[] = [];
  const filesByPath = new Map(
    snapshot.files.map((file) => [file.path, file] as const)
  );

  for (const filePatch of snapshot.patch.split(/(?=^diff --git )/m)) {
    if (!filePatch) {
      continue;
    }

    const index = filePatches.length;
    const treePath = getCanvasDiffPatchPath(filePatch) ?? undefined;
    const path = treePath ?? `Diff ${index + 1}`;
    filePatches.push({
      file: treePath ? filesByPath.get(treePath) : undefined,
      fileDiff: getSingularPatch(filePatch),
      key: `${path}:${index}`,
      patch: filePatch,
      path,
      treePath,
    });
  }

  return filePatches;
}

function getCanvasDiffPatchPath(filePatch: string): string | null {
  const pathMatch = /^diff --git a\/.+ b\/(.+)$/m.exec(filePatch);
  return pathMatch?.[1] ?? null;
}

function getCanvasDiffReviewKey(filePatches: CanvasDiffFilePatch[]): string {
  return filePatches.map((filePatch) => filePatch.key).join('\u0000');
}

function getCanvasDiffTreePaths(filePatches: CanvasDiffFilePatch[]): string[] {
  const paths = new Set<string>();
  for (const filePatch of filePatches) {
    if (filePatch.treePath) {
      paths.add(filePatch.treePath);
    }
  }
  return Array.from(paths);
}

function getCanvasDiffGitStatus(
  files: CanvasDiffFile[],
  paths: string[]
): GitStatusEntry[] {
  const treePaths = new Set(paths);
  const gitStatus: GitStatusEntry[] = [];

  for (const file of files) {
    if (!treePaths.has(file.path)) {
      continue;
    }

    gitStatus.push({
      path: file.path,
      status: file.status,
    });
  }

  return gitStatus;
}

function CanvasDiffReviewShell(props: {
  diffOptions: CanvasCodeViewOptions;
  filePatches: CanvasDiffFilePatch[];
  isRefreshing: boolean;
  layout: CanvasDiffLayout;
  snapshot: CanvasDiffSnapshot;
  wrapLines: boolean;
  onLayoutChange: (layout: CanvasDiffLayout) => void;
  onRefresh: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}) {
  const treePaths = getCanvasDiffTreePaths(props.filePatches);
  const directoryPaths = getFileTreeDirectoryPaths(treePaths);
  const canShowFileTree = treePaths.length > 0;
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [viewedPatchKeys, setViewedPatchKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const filePatchesByTreePath = new Map<string, CanvasDiffFilePatch>();
  for (const filePatch of props.filePatches) {
    if (filePatch.treePath) {
      filePatchesByTreePath.set(filePatch.treePath, filePatch);
    }
  }
  const filePatchesByKey = new Map(
    props.filePatches.map((filePatch) => [filePatch.key, filePatch] as const)
  );
  const codeViewItems: CodeViewItem<undefined>[] = props.filePatches.map(
    (filePatch) => {
      const viewed = viewedPatchKeys.has(filePatch.key);
      return {
        collapsed: viewed,
        fileDiff: filePatch.fileDiff,
        id: filePatch.key,
        type: 'diff',
        version: viewed ? 1 : 0,
      };
    }
  );
  const handleFileSelect = (path: string) => {
    const filePatch = filePatchesByTreePath.get(path);
    if (!filePatch) {
      return;
    }

    codeViewRef.current?.scrollTo({
      align: 'start',
      behavior: 'instant',
      id: filePatch.key,
      type: 'item',
    });
  };
  const handlePatchViewedChange = (patchKey: string, viewed: boolean) => {
    setViewedPatchKeys((currentViewedPatchKeys) => {
      const nextViewedPatchKeys = new Set(currentViewedPatchKeys);
      if (viewed) {
        nextViewedPatchKeys.add(patchKey);
      } else {
        nextViewedPatchKeys.delete(patchKey);
      }
      return nextViewedPatchKeys;
    });
  };
  const { model } = useFileTree({
    dragAndDrop: false,
    flattenEmptyDirectories: true,
    gitStatus: getCanvasDiffGitStatus(props.snapshot.files, treePaths),
    icons: {
      colored: false,
      set: 'standard',
    },
    initialExpansion: 2,
    initialSelectedPaths: treePaths[0] ? [treePaths[0]] : undefined,
    onSelectionChange: (selectedPaths) => {
      const nextSelectedPath = getSelectedFilePathFromSelection(selectedPaths);
      if (nextSelectedPath) {
        handleFileSelect(nextSelectedPath);
      }
    },
    paths: treePaths,
    renaming: false,
    search: false,
    stickyFolders: true,
  });
  const expansionState = useFileTreeExpansionState(model, directoryPaths);
  const diffPane = (
    <CanvasDiffShell
      layout={props.layout}
      snapshot={props.snapshot}
      wrapLines={props.wrapLines}
      isRefreshing={props.isRefreshing}
      toolbarEnd={
        canShowFileTree && !fileTreeOpen ? (
          <FileTreeSidebarToggle
            fileTreeOpen={fileTreeOpen}
            onFileTreeOpenChange={setFileTreeOpen}
          />
        ) : null
      }
      onLayoutChange={props.onLayoutChange}
      onRefresh={props.onRefresh}
      onWrapLinesChange={props.onWrapLinesChange}
    >
      <CodeView
        ref={codeViewRef}
        className="yyork-diff-code-view min-h-0 flex-1 overflow-auto"
        items={codeViewItems}
        options={props.diffOptions}
        renderHeaderMetadata={(item) => {
          const filePatch = filePatchesByKey.get(item.id);
          if (!filePatch) {
            return null;
          }

          return (
            <CanvasDiffViewedToggle
              filePatch={filePatch}
              viewed={viewedPatchKeys.has(filePatch.key)}
              onViewedChange={handlePatchViewedChange}
            />
          );
        }}
      />
    </CanvasDiffShell>
  );

  if (!canShowFileTree || !fileTreeOpen) {
    return (
      <div className="yyork-diff-review-workspace yyork-diff-review-workspace--collapsed">
        {diffPane}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className="yyork-diff-review-workspace"
      orientation="horizontal"
    >
      <ResizablePanel
        className="yyork-diff-review-panel"
        defaultSize={`${REVIEW_DIFF_DEFAULT_SIZE}%`}
        id={REVIEW_DIFF_PANEL_ID}
        minSize={REVIEW_DIFF_MIN_SIZE}
      >
        {diffPane}
      </ResizablePanel>
      <ResizableHandle className="yyork-file-tree-resize-handle" withHandle />
      <ResizablePanel
        className="yyork-diff-file-tree-resizable-panel"
        defaultSize={`${REVIEW_FILE_TREE_DEFAULT_SIZE}%`}
        id={REVIEW_FILE_TREE_PANEL_ID}
        maxSize={REVIEW_FILE_TREE_MAX_SIZE}
        minSize={REVIEW_FILE_TREE_MIN_SIZE}
      >
        <CanvasChangedFileTree
          directoryPaths={directoryPaths}
          expansionState={expansionState}
          fileTreeOpen={fileTreeOpen}
          model={model}
          onFileTreeOpenChange={setFileTreeOpen}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function CanvasDiffViewedToggle(props: {
  filePatch: CanvasDiffFilePatch;
  viewed: boolean;
  onViewedChange: (patchKey: string, viewed: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label={`Viewed ${props.filePatch.path}`}
      aria-labelledby={undefined}
      checked={props.viewed}
      labelProps={{
        className: cn(
          'yyork-diff-viewed-toggle',
          props.viewed && 'yyork-diff-viewed-toggle--checked'
        ),
        title: `Mark ${props.filePatch.path} as viewed`,
      }}
      onCheckedChange={(checked) => {
        props.onViewedChange(props.filePatch.key, checked === true);
      }}
      size="sm"
    >
      <span aria-hidden="true">Viewed</span>
    </Checkbox>
  );
}

function CanvasChangedFileTree(props: {
  directoryPaths: string[];
  expansionState: ReturnType<typeof useFileTreeExpansionState>;
  fileTreeOpen: boolean;
  model: FileTreeModel;
  onFileTreeOpenChange: (open: boolean) => void;
}) {
  return (
    <section
      aria-label="Changed files"
      className="yyork-file-tree-shell yyork-diff-file-tree-pane flex min-h-0 max-w-full flex-col"
    >
      <div className="yyork-file-tree-toolbar">
        <FileTreeExpansionToggle
          expansionState={props.expansionState}
          model={props.model}
          paths={props.directoryPaths}
        />
        <FileTreeSidebarToggle
          fileTreeOpen={props.fileTreeOpen}
          onFileTreeOpenChange={props.onFileTreeOpenChange}
        />
      </div>
      <PierreFileTree
        aria-label="Changed files"
        className="yyork-file-tree yyork-diff-file-tree min-h-0 flex-1"
        model={props.model}
      />
    </section>
  );
}

function CanvasDiffShell(props: {
  children: ReactNode;
  isRefreshing: boolean;
  layout: CanvasDiffLayout;
  snapshot: CanvasDiffSnapshot;
  toolbarEnd?: ReactNode;
  wrapLines: boolean;
  onLayoutChange: (layout: CanvasDiffLayout) => void;
  onRefresh: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}) {
  const summary = getDiffSummary(props.snapshot);

  return (
    <section
      aria-label="Session diff"
      className="flex h-full min-h-0 w-full max-w-full min-w-0 flex-1 flex-col bg-background"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <h3 className="shrink-0 truncate text-xs leading-4 font-medium text-foreground">
            {summary.title}
          </h3>
          <p
            aria-label={summary.detail}
            className="min-w-0 truncate text-2xs leading-4 text-muted-foreground"
          >
            {summary.changes ? (
              <>
                <span>{summary.changes.fileLabel}</span>
                <span aria-hidden="true"> · </span>
                {summary.changes.additionsLabel ? (
                  <span className="font-medium text-[var(--color-positive-600)] dark:text-[var(--color-positive-400)]">
                    {summary.changes.additionsLabel}
                  </span>
                ) : null}
                {summary.changes.additionsLabel &&
                summary.changes.deletionsLabel ? (
                  <span aria-hidden="true"> </span>
                ) : null}
                {summary.changes.deletionsLabel ? (
                  <span className="font-medium text-[var(--color-negative-600)] dark:text-[var(--color-negative-400)]">
                    {summary.changes.deletionsLabel}
                  </span>
                ) : null}
              </>
            ) : (
              summary.detail
            )}
          </p>
        </div>
        <fieldset className="inline-flex shrink-0 rounded-sm bg-muted p-0.5">
          <legend className="sr-only">Diff layout</legend>
          <Button
            type="button"
            variant={props.layout === 'split' ? 'secondary' : 'ghost'}
            size="xs"
            className="h-6 rounded-sm px-1.5 text-xs shadow-none"
            aria-pressed={props.layout === 'split'}
            onClick={() => props.onLayoutChange('split')}
          >
            <Columns2Icon data-icon="inline-start" aria-hidden="true" />
            <span>Split</span>
          </Button>
          <Button
            type="button"
            variant={props.layout === 'stacked' ? 'secondary' : 'ghost'}
            size="xs"
            className="h-6 rounded-sm px-1.5 text-xs shadow-none"
            aria-pressed={props.layout === 'stacked'}
            onClick={() => props.onLayoutChange('stacked')}
          >
            <Rows3Icon data-icon="inline-start" aria-hidden="true" />
            <span>Stacked</span>
          </Button>
        </fieldset>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                type="button"
                variant="default"
                size="icon-sm"
                pressed={props.wrapLines}
                className="size-7 rounded-sm"
                aria-label="Toggle line wrapping"
                onPressedChange={props.onWrapLinesChange}
              />
            }
          >
            <WrapTextIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Toggle line wrapping</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7 rounded-sm text-muted-foreground"
                aria-label="Refresh diff"
                disabled={props.isRefreshing}
                onClick={props.onRefresh}
              >
                {props.isRefreshing ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <RefreshCwIcon aria-hidden="true" />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom">
            <p>Refresh diff</p>
          </TooltipContent>
        </Tooltip>
        {props.toolbarEnd}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {props.children}
      </div>
    </section>
  );
}

function getDiffSummary(snapshot: CanvasDiffSnapshot) {
  const totals = snapshot.files.reduce(
    (accumulator, file) => ({
      additions: accumulator.additions + file.additions,
      deletions: accumulator.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 }
  );
  const fileLabel =
    snapshot.files.length === 1 ? '1 file' : `${snapshot.files.length} files`;
  const additionsLabel = totals.additions > 0 ? `+${totals.additions}` : null;
  const deletionsLabel = totals.deletions > 0 ? `-${totals.deletions}` : null;
  const changeLabel = [additionsLabel, deletionsLabel]
    .filter(Boolean)
    .join(' ');

  return {
    detail: changeLabel ? `${fileLabel} · ${changeLabel}` : snapshot.cwd,
    changes: changeLabel
      ? {
          additionsLabel,
          deletionsLabel,
          fileLabel,
        }
      : null,
    title: snapshot.baseLabel
      ? `Changes from ${snapshot.baseLabel}`
      : 'Changes',
  };
}

function CanvasDiffPlaceholder(props: {
  centered?: boolean;
  className?: string;
  detail: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 max-w-full flex-col gap-2 p-3 text-sm leading-5',
        props.centered
          ? 'h-full flex-1 items-center justify-center text-center'
          : 'h-full',
        props.className
      )}
    >
      {props.icon ? (
        <>
          <span className="sr-only">{props.title}</span>
          {props.icon}
        </>
      ) : (
        <h3 className="font-medium">{props.title}</h3>
      )}
      <p
        className={
          props.centered
            ? 'max-w-md text-muted-foreground'
            : 'break-all text-muted-foreground'
        }
      >
        {props.detail}
      </p>
    </div>
  );
}
