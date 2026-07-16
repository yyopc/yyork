import {
  CodeView,
  type CodeViewItem,
  type CodeViewProps,
} from '@pierre/diffs/react';
import type { GitStatusEntry } from '@pierre/trees';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import { useQuery } from '@tanstack/react-query';
import { CodeIcon, EyeIcon, FolderOpenIcon, WrapTextIcon } from 'lucide-react';
import {
  type ReactNode,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import { useTheme } from '@/lib/theme/provider';

import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { CanvasMarkdownPreview } from '@/features/home/components/molecules/canvas-markdown-preview';
import { CanvasWebPreview } from '@/features/home/components/molecules/canvas-web-preview';
import { CanvasDiffView } from '@/features/home/components/organisms/canvas-diff-view';
import {
  type SessionFileContent,
  sessionFileContentQueryOptions,
  sessionFilesQueryOptions,
} from '@/features/home/data/session-files';
import {
  getCanvasPreviewTargetKey,
  type HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';
import {
  type CanvasTab,
  isCanvasTab,
} from '@/features/home/domain/canvas-tabs';
import {
  type FileViewMode,
  getFilePreviewKind,
  resolveFileViewMode,
} from '@/features/home/domain/file-preview';

export type { CanvasTab } from '@/features/home/domain/canvas-tabs';

export interface CanvasTargetSummary {
  cwd?: string;
  projectId?: string;
  projectName?: string;
  sessionId?: string;
}

function getCanvasPreviewName(target: CanvasTargetSummary) {
  if (target.sessionId) {
    return `session:${target.sessionId}`;
  }
  return getCanvasPreviewTargetKey(target);
}

type FileCodeViewOptions = NonNullable<CodeViewProps<undefined>['options']>;

const FILES_LAYOUT_STORAGE_KEY = 'yyork.files.layout';
const FILE_VIEW_MODE_STORAGE_KEY = 'yyork.files.view-mode';
const FILE_PREVIEW_PANEL_ID = 'file-preview';
const FILE_TREE_PANEL_ID = 'file-tree';
const FILE_PREVIEW_DEFAULT_SIZE = 64;
const FILE_PREVIEW_MIN_SIZE = '40%';
const FILE_TREE_DEFAULT_SIZE = 36;
const FILE_TREE_MIN_SIZE = '24%';
const FILE_TREE_MAX_SIZE = '55%';
const defaultFileTreeLayout = {
  [FILE_PREVIEW_PANEL_ID]: FILE_PREVIEW_DEFAULT_SIZE,
  [FILE_TREE_PANEL_ID]: FILE_TREE_DEFAULT_SIZE,
};

function readStoredFileTreeLayout(): Record<string, number> {
  if (typeof window === 'undefined') {
    return defaultFileTreeLayout;
  }

  try {
    return normalizeFileTreeLayout(
      JSON.parse(
        window.localStorage.getItem(FILES_LAYOUT_STORAGE_KEY) ?? 'null'
      )
    );
  } catch {
    return defaultFileTreeLayout;
  }
}

function writeStoredFileTreeLayout(layout: Record<string, number>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      FILES_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeFileTreeLayout(layout))
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function normalizeFileTreeLayout(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultFileTreeLayout;
  }

  const previewSize = Reflect.get(value, FILE_PREVIEW_PANEL_ID);
  const treeSize = Reflect.get(value, FILE_TREE_PANEL_ID);

  if (
    typeof previewSize !== 'number' ||
    !Number.isFinite(previewSize) ||
    typeof treeSize !== 'number' ||
    !Number.isFinite(treeSize) ||
    previewSize <= 0 ||
    treeSize <= 0
  ) {
    return defaultFileTreeLayout;
  }

  return {
    [FILE_PREVIEW_PANEL_ID]: previewSize,
    [FILE_TREE_PANEL_ID]: treeSize,
  };
}

function readStoredFileViewMode(): FileViewMode {
  if (typeof window === 'undefined') {
    return 'preview';
  }

  try {
    const storedValue = window.localStorage.getItem(FILE_VIEW_MODE_STORAGE_KEY);
    return storedValue === 'code' ? 'code' : 'preview';
  } catch {
    return 'preview';
  }
}

function writeStoredFileViewMode(mode: FileViewMode) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(FILE_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function getWorkspaceFileTreeKey(input: {
  gitStatus: GitStatusEntry[];
  paths: string[];
  target: CanvasTargetSummary;
}): string {
  const gitStatusSignature = input.gitStatus
    .map((entry) => `${entry.path}:${entry.status}`)
    .join('\u0000');

  return [
    input.target.projectId ?? '',
    input.target.sessionId ?? '',
    input.paths.join('\u0000'),
    gitStatusSignature,
  ].join('\u0001');
}

export function CanvasPanel(props: {
  activeTab: CanvasTab;
  previewUrl?: string;
  reviewPreferences?: HomeWorkspaceCanvasReviewPreferences;
  selectedFilePath?: string;
  onPreviewUrlChange: (url: string) => void;
  onReviewPreferencesChange: (
    preferences: HomeWorkspaceCanvasReviewPreferences
  ) => void;
  onSelectedFilePathChange: (path: string | null) => void;
  onTabChange: (tab: CanvasTab) => void;
  target: CanvasTargetSummary;
}) {
  return (
    <aside
      aria-label="Canvas inspector"
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background"
    >
      <Tabs
        value={props.activeTab}
        onValueChange={(value) => {
          if (isCanvasTab(value)) {
            props.onTabChange(value);
          }
        }}
        className="min-h-0 w-full flex-1 flex-col gap-0"
      >
        <TabsContent value="files" className="min-h-0 w-full overflow-hidden">
          <CanvasFilesPanel
            active={props.activeTab === 'files'}
            selectedFilePath={props.selectedFilePath}
            onSelectedFilePathChange={props.onSelectedFilePathChange}
            target={props.target}
          />
        </TabsContent>
        <TabsContent value="review" className="min-h-0 w-full overflow-hidden">
          <CanvasDiffView
            active={props.activeTab === 'review'}
            reviewPreferences={props.reviewPreferences}
            onReviewPreferencesChange={props.onReviewPreferencesChange}
            target={props.target}
          />
        </TabsContent>
        <TabsContent value="browser" className="min-h-0 w-full overflow-hidden">
          <CanvasWebPreview
            defaultUrl={props.previewUrl}
            onUrlChange={props.onPreviewUrlChange}
            projectId={props.target.projectId}
            previewName={getCanvasPreviewName(props.target)}
            sessionId={props.target.sessionId}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function CanvasFilesPanel(props: {
  active: boolean;
  selectedFilePath?: string;
  onSelectedFilePathChange: (path: string | null) => void;
  target: CanvasTargetSummary;
}) {
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const {
    data: filesData,
    error: filesError,
    isError: filesIsError,
    isPending: filesIsPending,
  } = useQuery(
    sessionFilesQueryOptions({
      enabled: props.active,
      projectId: props.target.projectId,
      sessionId: props.target.sessionId,
    })
  );

  if (!props.target.sessionId) {
    return (
      <CanvasPlaceholder
        title="No session selected"
        detail={props.target.cwd ?? 'Select a worker session to browse files.'}
      />
    );
  }

  if (filesIsPending) {
    return (
      <CanvasPlaceholder
        title="Loading files"
        detail={props.target.cwd ?? 'Reading the selected workspace.'}
      />
    );
  }

  if (filesIsError) {
    return (
      <CanvasPlaceholder
        title="Unable to load files"
        detail={
          filesError instanceof Error
            ? filesError.message
            : 'The selected workspace file tree could not be loaded.'
        }
      />
    );
  }

  if (filesData.paths.length === 0) {
    return (
      <CanvasPlaceholder
        title="No files found"
        detail={filesData.workspacePath}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 max-w-full flex-col">
      <WorkspaceFileTree
        fileTreeOpen={fileTreeOpen}
        gitStatus={filesData.gitStatus}
        key={getWorkspaceFileTreeKey({
          gitStatus: filesData.gitStatus,
          paths: filesData.paths,
          target: props.target,
        })}
        onFileTreeOpenChange={setFileTreeOpen}
        onSelectedFilePathChange={props.onSelectedFilePathChange}
        paths={filesData.paths}
        selectedFilePath={props.selectedFilePath}
        target={props.target}
      />
    </div>
  );
}

function WorkspaceFileTree(props: {
  fileTreeOpen: boolean;
  gitStatus: GitStatusEntry[];
  onFileTreeOpenChange: (open: boolean) => void;
  onSelectedFilePathChange: (path: string | null) => void;
  paths: string[];
  selectedFilePath?: string;
  target: CanvasTargetSummary;
}) {
  const persistedSelectedFilePath = resolvePersistedSelectedFilePath(
    props.selectedFilePath,
    props.paths
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    persistedSelectedFilePath
  );
  const [fileTreeLayout] = useState(readStoredFileTreeLayout);
  const [fileViewMode, setFileViewMode] = useState(readStoredFileViewMode);
  const handleFileViewModeChange = (mode: FileViewMode) => {
    setFileViewMode(mode);
    writeStoredFileViewMode(mode);
  };
  const { model } = useFileTree({
    dragAndDrop: false,
    fileTreeSearchMode: 'hide-non-matches',
    flattenEmptyDirectories: true,
    gitStatus: props.gitStatus,
    icons: {
      colored: false,
      set: 'standard',
    },
    initialExpansion: 'closed',
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
  const directoryPaths = getFileTreeDirectoryPaths(props.paths);
  const expansionState = useFileTreeExpansionState(model, directoryPaths);

  const filePreview = (
    <CanvasFilePreview
      fileTreeOpen={props.fileTreeOpen}
      onFileTreeOpenChange={props.onFileTreeOpenChange}
      onViewModeChange={handleFileViewModeChange}
      selectedPath={selectedFilePath}
      target={props.target}
      viewMode={fileViewMode}
    />
  );

  if (!props.fileTreeOpen) {
    return (
      <div className="yyork-files-workspace yyork-files-workspace--collapsed">
        {filePreview}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className="yyork-files-workspace"
      defaultLayout={fileTreeLayout}
      onLayoutChanged={writeStoredFileTreeLayout}
      orientation="horizontal"
    >
      <ResizablePanel
        defaultSize={`${FILE_PREVIEW_DEFAULT_SIZE}%`}
        id={FILE_PREVIEW_PANEL_ID}
        minSize={FILE_PREVIEW_MIN_SIZE}
      >
        {filePreview}
      </ResizablePanel>
      <ResizableHandle className="yyork-file-tree-resize-handle" withHandle />
      <ResizablePanel
        className="yyork-file-tree-resizable-panel"
        defaultSize={`${FILE_TREE_DEFAULT_SIZE}%`}
        id={FILE_TREE_PANEL_ID}
        maxSize={FILE_TREE_MAX_SIZE}
        minSize={FILE_TREE_MIN_SIZE}
      >
        <section
          aria-label="Workspace file tree"
          className="yyork-file-tree-shell yyork-file-tree-pane flex min-h-0 max-w-full flex-col"
        >
          <div className="yyork-file-tree-toolbar">
            <FileTreeExpansionToggle
              expansionState={expansionState}
              model={model}
              paths={directoryPaths}
            />
            <FileTreeSidebarToggle
              fileTreeOpen={props.fileTreeOpen}
              onFileTreeOpenChange={props.onFileTreeOpenChange}
            />
          </div>
          <PierreFileTree
            aria-label="Workspace files"
            className="yyork-file-tree min-h-0 flex-1"
            model={model}
          />
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function CanvasFilePreview(props: {
  fileTreeOpen: boolean;
  onFileTreeOpenChange: (open: boolean) => void;
  onViewModeChange: (mode: FileViewMode) => void;
  selectedPath: string | null;
  target: CanvasTargetSummary;
  viewMode: FileViewMode;
}) {
  const { resolvedTheme } = useTheme();
  const [wrapLines, setWrapLines] = useState(false);
  const previewKind = getFilePreviewKind(props.selectedPath);
  const effectiveViewMode = resolveFileViewMode(previewKind, props.viewMode);
  const fileCodeThemeType =
    resolvedTheme === 'dark' || resolvedTheme === 'light'
      ? resolvedTheme
      : 'system';
  const {
    data: fileData,
    error: fileError,
    isError: fileIsError,
    isPending: fileIsPending,
  } = useQuery(
    sessionFileContentQueryOptions({
      enabled: Boolean(props.selectedPath),
      path: props.selectedPath,
      projectId: props.target.projectId,
      sessionId: props.target.sessionId,
    })
  );

  const fileCodeViewOptions: FileCodeViewOptions = {
    disableFileHeader: true,
    itemMetrics: {
      lineHeight: 17.4,
    },
    layout: {
      gap: 0,
      paddingBottom: 0,
      paddingTop: 0,
    },
    overflow: wrapLines ? 'wrap' : 'scroll',
    stickyHeaders: true,
    theme: {
      dark: 'pierre-dark',
      light: 'pierre-light',
    },
    themeType: fileCodeThemeType,
  };

  return (
    <section
      aria-label="Selected file"
      className="yyork-file-preview-pane flex min-h-0 min-w-0 flex-col"
    >
      {props.selectedPath ? (
        <div className="yyork-file-preview-header yyork-file-preview-header--with-action py-3">
          <span className="min-w-0 flex-1 truncate">{props.selectedPath}</span>
          <div className="yyork-file-preview-header-controls">
            {previewKind ? (
              <FileViewModeToggle
                onViewModeChange={props.onViewModeChange}
                viewMode={effectiveViewMode}
              />
            ) : null}
            {effectiveViewMode === 'code' ? (
              <FileWrapToggle
                wrapLines={wrapLines}
                onWrapChange={setWrapLines}
              />
            ) : null}
            {!props.fileTreeOpen ? (
              <FileTreeSidebarToggle
                fileTreeOpen={props.fileTreeOpen}
                onFileTreeOpenChange={props.onFileTreeOpenChange}
              />
            ) : null}
          </div>
        </div>
      ) : !props.fileTreeOpen ? (
        <div className="yyork-file-preview-floating-action">
          <FileTreeSidebarToggle
            fileTreeOpen={props.fileTreeOpen}
            onFileTreeOpenChange={props.onFileTreeOpenChange}
          />
        </div>
      ) : null}
      <div className="yyork-file-preview-body">
        {!props.selectedPath ? (
          <CanvasPlaceholder
            centered
            detail="Select a file from the workspace tree."
            icon={
              <FolderOpenIcon
                aria-hidden="true"
                className="size-10 text-muted-foreground"
              />
            }
            title="Open file"
          />
        ) : fileIsPending ? (
          <CanvasPlaceholder
            centered
            title="Loading file"
            detail={props.selectedPath}
          />
        ) : fileIsError ? (
          <CanvasPlaceholder
            centered
            title="Unable to load file"
            detail={
              fileError instanceof Error
                ? fileError.message
                : 'The selected file could not be loaded.'
            }
          />
        ) : fileData.binary ? (
          <CanvasPlaceholder
            centered
            title="Binary file"
            detail="Open this file in an IDE to inspect it."
          />
        ) : (
          <>
            {fileData.truncated ? (
              <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                Showing the first 1 MB. Open in an IDE for the full file.
              </p>
            ) : null}
            {effectiveViewMode === 'preview' && previewKind === 'markdown' ? (
              <CanvasMarkdownPreview
                key={fileData.path}
                content={fileData.contents}
              />
            ) : (
              <div
                key={fileData.path}
                className="yyork-file-code-scroll"
                onWheel={handleFileCodeViewWheel}
              >
                <CodeView
                  className="yyork-file-code-viewer"
                  items={getCodeViewItemsForFile(fileData)}
                  options={fileCodeViewOptions}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FileViewModeToggle(props: {
  onViewModeChange: (mode: FileViewMode) => void;
  viewMode: FileViewMode;
}) {
  return (
    <fieldset className="inline-flex shrink-0 rounded-sm bg-muted p-0.5">
      <legend className="sr-only">File view mode</legend>
      <Button
        type="button"
        variant={props.viewMode === 'preview' ? 'secondary' : 'ghost'}
        size="xs"
        className="h-6 rounded-sm px-1.5 text-xs shadow-none"
        aria-pressed={props.viewMode === 'preview'}
        onClick={() => {
          props.onViewModeChange('preview');
        }}
      >
        <EyeIcon data-icon="inline-start" aria-hidden="true" />
        <span>Preview</span>
      </Button>
      <Button
        type="button"
        variant={props.viewMode === 'code' ? 'secondary' : 'ghost'}
        size="xs"
        className="h-6 rounded-sm px-1.5 text-xs shadow-none"
        aria-pressed={props.viewMode === 'code'}
        onClick={() => {
          props.onViewModeChange('code');
        }}
      >
        <CodeIcon data-icon="inline-start" aria-hidden="true" />
        <span>Code</span>
      </Button>
    </fieldset>
  );
}

function FileWrapToggle(props: {
  onWrapChange: (wrap: boolean) => void;
  wrapLines: boolean;
}) {
  const label = props.wrapLines ? 'Disable line wrap' : 'Wrap lines';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            aria-label={label}
            aria-pressed={props.wrapLines}
            onClick={() => {
              props.onWrapChange(!props.wrapLines);
            }}
          />
        }
      >
        <WrapTextIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function resolvePersistedSelectedFilePath(
  selectedFilePath: string | undefined,
  paths: string[]
): string | null {
  if (!selectedFilePath || selectedFilePath.endsWith('/')) {
    return null;
  }

  return paths.includes(selectedFilePath) ? selectedFilePath : null;
}

function handleFileCodeViewWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const target =
    event.currentTarget.querySelector<HTMLElement>('.yyork-file-code-viewer') ??
    event.currentTarget;
  const maxScrollTop = target.scrollHeight - target.clientHeight;
  const maxScrollLeft = target.scrollWidth - target.clientWidth;

  if (maxScrollTop <= 0 && maxScrollLeft <= 0) {
    return;
  }

  const nextScrollTop =
    maxScrollTop > 0
      ? clampScrollPosition(target.scrollTop + event.deltaY, maxScrollTop)
      : target.scrollTop;
  const nextScrollLeft =
    maxScrollLeft > 0
      ? clampScrollPosition(target.scrollLeft + event.deltaX, maxScrollLeft)
      : target.scrollLeft;

  if (
    nextScrollTop === target.scrollTop &&
    nextScrollLeft === target.scrollLeft
  ) {
    return;
  }

  event.preventDefault();
  target.scrollTop = nextScrollTop;
  target.scrollLeft = nextScrollLeft;
}

function clampScrollPosition(value: number, maxValue: number): number {
  return Math.min(Math.max(value, 0), maxValue);
}

function getCodeViewItemsForFile(
  file: SessionFileContent
): CodeViewItem<undefined>[] {
  const version = getStringVersion(file.contents);

  return [
    {
      file: {
        cacheKey: `${file.path}:${file.size}:${file.truncated ? 'truncated' : 'full'}:${version}`,
        contents: file.contents,
        name: file.path,
      },
      id: file.path,
      type: 'file',
      version,
    },
  ];
}

function getStringVersion(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return hash >>> 0;
}

function CanvasPlaceholder(props: {
  centered?: boolean;
  detail: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div
      className={`flex min-h-0 max-w-full flex-col gap-2 p-3 text-sm leading-5${
        props.centered
          ? ' h-full flex-1 items-center justify-center text-center'
          : ' h-full'
      }`}
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
            ? 'text-muted-foreground'
            : 'break-all text-muted-foreground'
        }
      >
        {props.detail}
      </p>
    </div>
  );
}
