import {
  type CodeViewLineSelection,
  type FileDiffMetadata,
  getSingularPatch,
  type SelectionSide,
} from '@pierre/diffs';
import type {
  CodeViewHandle,
  CodeViewItem,
  CodeViewProps,
} from '@pierre/diffs/react';
import { CodeView } from '@pierre/diffs/react';
import type { FileTree as FileTreeModel, GitStatusEntry } from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Columns2Icon,
  FileDiffIcon,
  RefreshCwIcon,
  Rows3Icon,
  Trash2Icon,
  WrapTextIcon,
} from 'lucide-react';
import { type ReactNode, useReducer, useRef } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
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
  type AnnotationPayload,
  sendAnnotationsMutationOptions,
} from '@/features/home/data/annotations';
import {
  type CanvasDiffSnapshot,
  sessionCanvasDiffQueryOptions,
} from '@/features/home/data/canvas-diff';
import type {
  HomeWorkspaceCanvasReviewDiffLayout,
  HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';

type CanvasDiffLayout = HomeWorkspaceCanvasReviewDiffLayout;
type CanvasCodeViewOptions = NonNullable<
  CodeViewProps<CanvasDiffAnnotation>['options']
>;
type CanvasDiffFile = CanvasDiffSnapshot['files'][number];

interface CanvasDiffAnnotation {
  body?: string;
  filePath: string;
  id: string;
  kind: 'comment' | 'draft';
  lineLabel: string;
  lineNumber: number;
  patchKey: string;
  side: 'additions' | 'deletions';
}

interface CanvasDiffReviewState {
  annotationDraft: string;
  annotationRevision: number;
  annotations: CanvasDiffAnnotation[];
  fileTreeOpen: boolean;
  selectedLines: CodeViewLineSelection | null;
  viewedPatchKeys: ReadonlySet<string>;
}

type CanvasDiffReviewAction =
  | {
      type: 'addAnnotation';
      annotation: CanvasDiffAnnotation;
    }
  | {
      type: 'cancelAnnotation';
    }
  | {
      type: 'deleteAnnotation';
      annotationId: string;
    }
  | {
      type: 'setAnnotationDraft';
      draft: string;
    }
  | {
      type: 'setFileTreeOpen';
      open: boolean;
    }
  | {
      type: 'setPatchViewed';
      patchKey: string;
      viewed: boolean;
    }
  | {
      type: 'setSelectedLines';
      selection: CodeViewLineSelection | null;
    };

function createCanvasDiffReviewState(): CanvasDiffReviewState {
  return {
    annotationDraft: '',
    annotationRevision: 0,
    annotations: [],
    fileTreeOpen: true,
    selectedLines: null,
    viewedPatchKeys: new Set(),
  };
}

function canvasDiffReviewReducer(
  state: CanvasDiffReviewState,
  action: CanvasDiffReviewAction
): CanvasDiffReviewState {
  switch (action.type) {
    case 'addAnnotation':
      return {
        ...state,
        annotationDraft: '',
        annotationRevision: state.annotationRevision + 1,
        annotations: [...state.annotations, action.annotation],
        selectedLines: null,
      };
    case 'cancelAnnotation':
      return {
        ...state,
        annotationDraft: '',
        selectedLines: null,
      };
    case 'deleteAnnotation':
      return {
        ...state,
        annotationRevision: state.annotationRevision + 1,
        annotations: state.annotations.filter(
          (annotation) => annotation.id !== action.annotationId
        ),
      };
    case 'setAnnotationDraft':
      return {
        ...state,
        annotationDraft: action.draft,
      };
    case 'setFileTreeOpen':
      return {
        ...state,
        fileTreeOpen: action.open,
      };
    case 'setPatchViewed': {
      const viewedPatchKeys = new Set(state.viewedPatchKeys);
      if (action.viewed) {
        viewedPatchKeys.add(action.patchKey);
      } else {
        viewedPatchKeys.delete(action.patchKey);
      }
      return {
        ...state,
        viewedPatchKeys,
      };
    }
    case 'setSelectedLines':
      return {
        ...state,
        annotationDraft: '',
        annotationRevision: state.annotationRevision + 1,
        selectedLines: action.selection,
      };
  }
}

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
    enableLineSelection: true,
    hunkSeparators: 'line-info',
    lineHoverHighlight: 'number',
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
      target={props.target}
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

function getCanvasDiffCodeViewItems(input: {
  annotationRevision: number;
  annotations: CanvasDiffAnnotation[];
  filePatches: CanvasDiffFilePatch[];
  selectedLines: CodeViewLineSelection | null;
  viewedPatchKeys: ReadonlySet<string>;
}): CodeViewItem<CanvasDiffAnnotation>[] {
  const annotationsByPatchKey = new Map<string, CanvasDiffAnnotation[]>();
  for (const annotation of input.annotations) {
    const patchAnnotations = annotationsByPatchKey.get(annotation.patchKey);
    if (patchAnnotations) {
      patchAnnotations.push(annotation);
    } else {
      annotationsByPatchKey.set(annotation.patchKey, [annotation]);
    }
  }
  if (input.selectedLines) {
    const draftAnnotation = getCanvasDiffDraftAnnotation(
      input.filePatches,
      input.selectedLines
    );
    if (draftAnnotation) {
      const patchAnnotations = annotationsByPatchKey.get(
        draftAnnotation.patchKey
      );
      if (patchAnnotations) {
        patchAnnotations.push(draftAnnotation);
      } else {
        annotationsByPatchKey.set(draftAnnotation.patchKey, [draftAnnotation]);
      }
    }
  }

  return input.filePatches.map((filePatch) => {
    const viewed = input.viewedPatchKeys.has(filePatch.key);
    return {
      annotations: annotationsByPatchKey
        .get(filePatch.key)
        ?.map((annotation) => ({
          lineNumber: annotation.lineNumber,
          metadata: annotation,
          side: annotation.side,
        })),
      collapsed: viewed,
      fileDiff: filePatch.fileDiff,
      id: filePatch.key,
      type: 'diff',
      version: (viewed ? 1 : 0) + input.annotationRevision * 2,
    };
  });
}

function getCanvasDiffDraftAnnotation(
  filePatches: CanvasDiffFilePatch[],
  selection: CodeViewLineSelection
): CanvasDiffAnnotation | null {
  const filePatch = filePatches.find((patch) => patch.key === selection.id);
  if (!filePatch) {
    return null;
  }

  const side = getAnnotationSelectionSide(selection);
  const lineNumber = selection.range.end;
  return {
    filePath: filePatch.path,
    id: `draft:${selection.id}:${side}:${lineNumber}`,
    kind: 'draft',
    lineLabel: getAnnotationLineLabel(filePatch.path, selection),
    lineNumber,
    patchKey: selection.id,
    side,
  };
}

function CanvasDiffReviewShell(props: {
  diffOptions: CanvasCodeViewOptions;
  filePatches: CanvasDiffFilePatch[];
  isRefreshing: boolean;
  layout: CanvasDiffLayout;
  snapshot: CanvasDiffSnapshot;
  target: CanvasDiffTarget;
  wrapLines: boolean;
  onLayoutChange: (layout: CanvasDiffLayout) => void;
  onRefresh: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}) {
  const treePaths = getCanvasDiffTreePaths(props.filePatches);
  const directoryPaths = getFileTreeDirectoryPaths(treePaths);
  const canShowFileTree = treePaths.length > 0;
  const [reviewState, dispatchReviewState] = useReducer(
    canvasDiffReviewReducer,
    undefined,
    createCanvasDiffReviewState
  );
  const codeViewRef = useRef<CodeViewHandle<CanvasDiffAnnotation>>(null);
  const annotationIdCounterRef = useRef(0);
  const sendAnnotationMutation = useMutation(sendAnnotationsMutationOptions());
  const filePatchesByTreePath = new Map<string, CanvasDiffFilePatch>();
  for (const filePatch of props.filePatches) {
    if (filePatch.treePath) {
      filePatchesByTreePath.set(filePatch.treePath, filePatch);
    }
  }
  const filePatchesByKey = new Map(
    props.filePatches.map((filePatch) => [filePatch.key, filePatch] as const)
  );
  const codeViewItems = getCanvasDiffCodeViewItems({
    annotationRevision: reviewState.annotationRevision,
    annotations: reviewState.annotations,
    filePatches: props.filePatches,
    selectedLines: reviewState.selectedLines,
    viewedPatchKeys: reviewState.viewedPatchKeys,
  });
  const codeViewOptions: CanvasCodeViewOptions = {
    ...props.diffOptions,
    enableGutterUtility: true,
    onGutterUtilityClick: (range, context) => {
      dispatchReviewState({
        selection: {
          id: context.item.id,
          range,
        },
        type: 'setSelectedLines',
      });
    },
  };
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
    dispatchReviewState({
      patchKey,
      type: 'setPatchViewed',
      viewed,
    });
  };
  const handleSelectedLinesChange = (
    selection: CodeViewLineSelection | null
  ) => {
    dispatchReviewState({
      selection,
      type: 'setSelectedLines',
    });
  };
  const handleAnnotationSubmit = () => {
    const body = reviewState.annotationDraft.trim();
    if (!body || !reviewState.selectedLines) {
      return;
    }

    const filePatch = filePatchesByKey.get(reviewState.selectedLines.id);
    if (!filePatch) {
      return;
    }

    const side = getAnnotationSelectionSide(reviewState.selectedLines);
    const lineNumber = reviewState.selectedLines.range.end;
    annotationIdCounterRef.current += 1;
    const annotationId = [
      reviewState.selectedLines.id,
      side,
      lineNumber,
      annotationIdCounterRef.current,
    ].join(':');
    const lineLabel = getAnnotationLineLabel(
      filePatch.path,
      reviewState.selectedLines
    );
    const annotation: CanvasDiffAnnotation = {
      body,
      filePath: filePatch.path,
      id: annotationId,
      kind: 'comment',
      lineLabel,
      lineNumber,
      patchKey: reviewState.selectedLines.id,
      side,
    };
    dispatchReviewState({
      annotation,
      type: 'addAnnotation',
    });
    codeViewRef.current?.clearSelectedLines();
    sendAnnotationToAgent(annotation);
  };
  const handleAnnotationCancel = () => {
    dispatchReviewState({ type: 'cancelAnnotation' });
    codeViewRef.current?.clearSelectedLines();
  };
  const handleAnnotationDelete = (annotationId: string) => {
    dispatchReviewState({
      annotationId,
      type: 'deleteAnnotation',
    });
  };
  const sendAnnotationToAgent = (annotation: CanvasDiffAnnotation) => {
    if (!props.target.sessionId) {
      toast.error('Select a worker session to send annotations.');
      return;
    }

    sendAnnotationMutation.mutate(
      {
        annotations: [toCanvasDiffAnnotationPayload(annotation)],
        projectId: props.target.projectId,
        sessionId: props.target.sessionId,
      },
      {
        onError: (errorValue) => {
          toast.error(
            errorValue instanceof Error
              ? errorValue.message
              : 'Failed to send annotation.'
          );
        },
        onSuccess: (result) => {
          toast.success(
            `Sent ${result.delivered} code annotation${result.delivered === 1 ? '' : 's'} to the agent.`
          );
        },
      }
    );
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
        canShowFileTree && !reviewState.fileTreeOpen ? (
          <FileTreeSidebarToggle
            fileTreeOpen={reviewState.fileTreeOpen}
            onFileTreeOpenChange={(open) =>
              dispatchReviewState({
                open,
                type: 'setFileTreeOpen',
              })
            }
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
        options={codeViewOptions}
        selectedLines={reviewState.selectedLines}
        onSelectedLinesChange={handleSelectedLinesChange}
        renderAnnotation={(annotation) => {
          if (!annotation.metadata) {
            return null;
          }

          if (annotation.metadata.kind === 'draft') {
            return (
              <CanvasDiffAnnotationComposer
                draft={reviewState.annotationDraft}
                lineLabel={annotation.metadata.lineLabel}
                onCancel={handleAnnotationCancel}
                onDraftChange={(draft) =>
                  dispatchReviewState({
                    draft,
                    type: 'setAnnotationDraft',
                  })
                }
                onSubmit={handleAnnotationSubmit}
              />
            );
          }

          return (
            <CanvasDiffAnnotationCard
              annotation={annotation.metadata}
              onDelete={handleAnnotationDelete}
            />
          );
        }}
        renderHeaderMetadata={(item) => {
          const filePatch = filePatchesByKey.get(item.id);
          if (!filePatch) {
            return null;
          }

          return (
            <CanvasDiffViewedToggle
              filePatch={filePatch}
              viewed={reviewState.viewedPatchKeys.has(filePatch.key)}
              onViewedChange={handlePatchViewedChange}
            />
          );
        }}
      />
    </CanvasDiffShell>
  );

  return (
    <CanvasDiffReviewWorkspace
      canShowFileTree={canShowFileTree}
      diffPane={diffPane}
      directoryPaths={directoryPaths}
      expansionState={expansionState}
      fileTreeOpen={reviewState.fileTreeOpen}
      model={model}
      onFileTreeOpenChange={(open) =>
        dispatchReviewState({
          open,
          type: 'setFileTreeOpen',
        })
      }
    />
  );
}

function CanvasDiffReviewWorkspace(props: {
  canShowFileTree: boolean;
  diffPane: ReactNode;
  directoryPaths: string[];
  expansionState: ReturnType<typeof useFileTreeExpansionState>;
  fileTreeOpen: boolean;
  model: FileTreeModel;
  onFileTreeOpenChange: (open: boolean) => void;
}) {
  if (!props.canShowFileTree || !props.fileTreeOpen) {
    return (
      <div className="yyork-diff-review-workspace yyork-diff-review-workspace--collapsed">
        {props.diffPane}
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
        {props.diffPane}
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
          directoryPaths={props.directoryPaths}
          expansionState={props.expansionState}
          fileTreeOpen={props.fileTreeOpen}
          model={props.model}
          onFileTreeOpenChange={props.onFileTreeOpenChange}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function CanvasDiffAnnotationComposer(props: {
  draft: string;
  lineLabel: string;
  onCancel: () => void;
  onDraftChange: (draft: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      aria-label="Code annotation"
      className="yyork-diff-annotation-composer"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="w-full min-w-0">
        <Textarea
          aria-label={`Annotation for ${props.lineLabel}`}
          autoFocus
          className="yyork-diff-annotation-textarea focus-visible:ring-0"
          placeholder="Requested change"
          rows={2}
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.currentTarget.value)}
        />
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-1.5">
        <Button
          disabled={props.draft.trim() === ''}
          size="xs"
          type="submit"
          variant="default"
        >
          Add annotation
        </Button>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          onClick={props.onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CanvasDiffAnnotationCard(props: {
  annotation: CanvasDiffAnnotation;
  onDelete: (annotationId: string) => void;
}) {
  return (
    <article
      aria-label={`Annotation on ${props.annotation.lineLabel}`}
      className="yyork-diff-annotation-card"
    >
      <div className="flex min-w-0 items-start gap-2">
        <div
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-medium text-primary-foreground"
        >
          Y
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs leading-4 font-medium text-foreground">
            You
          </p>
          <p className="mt-1 text-xs leading-5 whitespace-pre-wrap text-foreground">
            {props.annotation.body ?? ''}
          </p>
        </div>
        <Button
          aria-label="Delete annotation"
          className="size-6 rounded-sm text-muted-foreground"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => props.onDelete(props.annotation.id)}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </article>
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

function normalizeAnnotationSide(
  side?: SelectionSide
): 'additions' | 'deletions' {
  return side === 'deletions' ? 'deletions' : 'additions';
}

function getAnnotationSelectionSide(
  selection: CodeViewLineSelection
): 'additions' | 'deletions' {
  return normalizeAnnotationSide(
    selection.range.endSide ?? selection.range.side
  );
}

function getAnnotationLineLabel(
  filePath: string,
  selection: CodeViewLineSelection
): string {
  const side = getAnnotationSelectionSide(selection);
  const sideLabel = side === 'additions' ? 'added' : 'removed';
  const lineStart = Math.min(selection.range.start, selection.range.end);
  const lineEnd = Math.max(selection.range.start, selection.range.end);
  const lineLabel =
    lineStart === lineEnd ? `line ${lineEnd}` : `lines ${lineStart}-${lineEnd}`;

  return `${filePath} · ${sideLabel} ${lineLabel}`;
}

function toCanvasDiffAnnotationPayload(
  annotation: CanvasDiffAnnotation
): AnnotationPayload {
  return {
    comment: annotation.body ?? '',
    element: 'review diff',
    elementPath: annotation.lineLabel,
    id: annotation.id,
    intent: 'code-review',
    selectedText: annotation.lineLabel,
  };
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
