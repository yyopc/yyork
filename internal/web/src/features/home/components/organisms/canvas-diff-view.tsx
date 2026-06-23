import type { PatchDiffProps } from '@pierre/diffs/react';
import { PatchDiff, Virtualizer } from '@pierre/diffs/react';
import { useQuery } from '@tanstack/react-query';
import {
  Columns2Icon,
  FileDiffIcon,
  RefreshCwIcon,
  Rows3Icon,
  WrapTextIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  type CanvasDiffSnapshot,
  sessionCanvasDiffQueryOptions,
} from '@/features/home/data/canvas-diff';
import type {
  HomeWorkspaceCanvasReviewDiffLayout,
  HomeWorkspaceCanvasReviewPreferences,
} from '@/features/home/data/workspace-preferences';

type CanvasDiffLayout = HomeWorkspaceCanvasReviewDiffLayout;
type CanvasPatchDiffOptions = NonNullable<PatchDiffProps<undefined>['options']>;

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
  const diffOptions: CanvasPatchDiffOptions = {
    collapsedContextThreshold: 3,
    diffIndicators: 'bars',
    diffStyle: layout === 'split' ? 'split' : 'unified',
    hunkSeparators: 'line-info',
    lineDiffType: 'word',
    overflow: wrapLines ? 'wrap' : 'scroll',
    stickyHeader: true,
    theme: {
      dark: 'pierre-dark',
      light: 'pierre-light',
    },
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
      <Virtualizer
        className="yyork-diff-virtualizer min-h-0 flex-1 overflow-auto"
        contentClassName="yyork-diff-virtualizer-content"
      >
        {diffSnapshot.patch
          .split(/(?=^diff --git )/m)
          .filter(Boolean)
          .map((filePatch) => {
            const pathMatch = /^diff --git a\/.+ b\/(.+)$/m.exec(filePatch);
            const key = pathMatch?.[1] ?? filePatch.slice(0, 40);
            return (
              <PatchDiff
                key={key}
                className="yyork-diff-viewer"
                options={diffOptions}
                patch={filePatch}
              />
            );
          })}
      </Virtualizer>
    </CanvasDiffShell>
  );
}

function CanvasDiffShell(props: {
  children: ReactNode;
  isRefreshing: boolean;
  layout: CanvasDiffLayout;
  snapshot: CanvasDiffSnapshot;
  wrapLines: boolean;
  onLayoutChange: (layout: CanvasDiffLayout) => void;
  onRefresh: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}) {
  const summary = getDiffSummary(props.snapshot);

  return (
    <section
      aria-label="Session diff"
      className="flex h-full min-h-0 max-w-full flex-col bg-background"
    >
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs leading-4 font-medium text-foreground">
            {summary.title}
          </h3>
          <p className="truncate text-2xs leading-4 text-muted-foreground">
            {summary.detail}
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
                className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
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
  const changeLabel = [
    totals.additions > 0 ? `+${totals.additions}` : undefined,
    totals.deletions > 0 ? `-${totals.deletions}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    detail: changeLabel ? `${fileLabel} · ${changeLabel}` : snapshot.cwd,
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
