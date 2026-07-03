import type {
  FileTree as FileTreeModel,
  FileTreeDirectoryHandle,
  FileTreeItemHandle,
} from '@pierre/trees';
import {
  ListCollapseIcon,
  ListTreeIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FileTreeSidebarToggle(props: {
  fileTreeOpen: boolean;
  onFileTreeOpenChange: (open: boolean) => void;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const label = props.fileTreeOpen ? 'Hide file tree' : 'Show file tree';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground"
            aria-label={label}
            aria-pressed={props.fileTreeOpen}
            onClick={() => {
              props.onFileTreeOpenChange(!props.fileTreeOpen);
            }}
          />
        }
      >
        {props.fileTreeOpen ? (
          <PanelRightCloseIcon aria-hidden="true" />
        ) : (
          <PanelRightOpenIcon aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent side={props.tooltipSide ?? 'left'}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function FileTreeExpansionToggle(props: {
  expansionState: FileTreeExpansionState;
  model: FileTreeModel;
  paths: string[];
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const disabled = props.expansionState.directoryCount === 0;
  const label = props.expansionState.allExpanded
    ? 'Collapse all folders'
    : 'Expand all folders';
  const Icon = props.expansionState.allExpanded
    ? ListCollapseIcon
    : ListTreeIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-sm text-muted-foreground"
            aria-label={label}
            aria-pressed={props.expansionState.allExpanded}
            disabled={disabled}
            onClick={() => {
              setFileTreeDirectoryExpansion(
                props.model,
                props.paths,
                !props.expansionState.allExpanded
              );
            }}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side={props.tooltipSide ?? 'left'}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export interface FileTreeExpansionState {
  allExpanded: boolean;
  directoryCount: number;
  expandedDirectoryCount: number;
}

export function getSelectedFilePathFromSelection(
  selectedPaths: readonly string[]
): string | null {
  for (let index = selectedPaths.length - 1; index >= 0; index -= 1) {
    const selectedPath = selectedPaths[index];
    if (selectedPath && !selectedPath.endsWith('/')) {
      return selectedPath;
    }
  }

  return null;
}

export function useFileTreeExpansionState(
  model: FileTreeModel,
  directoryPaths: string[]
): FileTreeExpansionState {
  // Recomputing the expansion signature is O(directories), and the model emits
  // one change event per directory during expand/collapse-all. Reading it on
  // every emit makes bulk expansion O(directories^2). Coalesce recomputes into
  // a single animation frame while keeping the current paths in render state.
  const getSnapshot = () =>
    getFileTreeExpansionSignature(model, directoryPaths);

  function subscribe(onStoreChange: () => void) {
    let frame = 0;
    let currentSignature = getSnapshot();

    const flush = () => {
      frame = 0;
      const next = getSnapshot();
      if (next !== currentSignature) {
        currentSignature = next;
        onStoreChange();
      }
    };

    const unsubscribe = model.subscribe(() => {
      if (frame === 0) {
        frame = requestAnimationFrame(flush);
      }
    });

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      unsubscribe();
    };
  }

  const signature = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [directoryCount = 0, expandedDirectoryCount = 0] = signature
    .split(':')
    .map((value) => Number(value));

  return {
    allExpanded:
      directoryCount > 0 && expandedDirectoryCount === directoryCount,
    directoryCount,
    expandedDirectoryCount,
  };
}

function getFileTreeExpansionSignature(
  model: FileTreeModel,
  directoryPaths: string[]
): string {
  let expandedDirectoryCount = 0;
  for (const path of directoryPaths) {
    if (getFileTreeDirectoryHandle(model, path)?.isExpanded()) {
      expandedDirectoryCount += 1;
    }
  }

  return `${directoryPaths.length}:${expandedDirectoryCount}`;
}

function setFileTreeDirectoryExpansion(
  model: FileTreeModel,
  directoryPaths: string[],
  expanded: boolean
) {
  const paths = expanded
    ? directoryPaths
    : getReversedFileTreeDirectoryPaths(directoryPaths);
  for (const path of paths) {
    const directory = getFileTreeDirectoryHandle(model, path);
    if (!directory || directory.isExpanded() === expanded) {
      continue;
    }

    if (expanded) {
      directory.expand();
    } else {
      directory.collapse();
    }
  }
}

function getFileTreeDirectoryHandle(
  model: FileTreeModel,
  path: string
): FileTreeDirectoryHandle | null {
  const item = model.getItem(path);
  if (!isFileTreeDirectoryHandle(item)) {
    return null;
  }

  return item;
}

function isFileTreeDirectoryHandle(
  item: FileTreeItemHandle | null
): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true;
}

export function getFileTreeDirectoryPaths(paths: string[]): string[] {
  const directoryPaths = new Set<string>();
  for (const path of paths) {
    const trimmedPath = path.replace(/^\/+|\/+$/g, '');
    if (!trimmedPath) {
      continue;
    }

    const segments = trimmedPath.split('/');
    const terminalSegmentCount = path.endsWith('/')
      ? segments.length
      : segments.length - 1;
    for (let index = 1; index <= terminalSegmentCount; index += 1) {
      directoryPaths.add(`${segments.slice(0, index).join('/')}/`);
    }
  }

  const sortedDirectoryPaths = Array.from(directoryPaths);
  sortedDirectoryPaths.sort(compareFileTreeDirectoryPaths);
  return sortedDirectoryPaths;
}

function compareFileTreeDirectoryPaths(left: string, right: string): number {
  const leftDepth = left.split('/').length;
  const rightDepth = right.split('/').length;
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  return left.localeCompare(right);
}

function getReversedFileTreeDirectoryPaths(paths: string[]): string[] {
  const reversedPaths: string[] = [];
  for (let index = paths.length - 1; index >= 0; index -= 1) {
    const path = paths[index];
    if (path) {
      reversedPaths.push(path);
    }
  }

  return reversedPaths;
}
