import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PanelLeftIcon,
  PlusIcon,
} from 'lucide-react';
import { type ForwardedRef,forwardRef } from 'react';

import { appHotkeys } from '@/lib/app-hotkeys';
import { cn } from '@/lib/tailwind/utils';

import { ShortcutKbdGroup } from '@/components/ui/shortcut-kbd';

import {
  ADD_PROJECT_ANCHOR_ATTR,
  type AddProjectAnchorId,
  type AddProjectSource,
} from '@/features/home/domain/add-project';

/**
 * Home empty state shown when no project has been added yet. It teaches the
 * "add a project from the sidebar" flow with a cropped, top-left preview of the
 * yyork app surface — the `+` in the Projects group is highlighted with a
 * pointer and tooltip. The preview reuses the app's own semantic tokens so it
 * tracks the active theme automatically.
 *
 * Sizing mirrors the source design exactly (card 424×438).
 */
export function NoProjectsEmptyState(props: {
  className?: string;
  onAddProject?: (source?: AddProjectSource) => void | Promise<void>;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background p-6',
        props.className
      )}
    >
      <div
        data-testid="no-projects-card"
        className="relative flex h-[438px] w-[424px] origin-center scale-[1.15] flex-col items-center gap-[18px] overflow-hidden rounded-2xl border border-border bg-background px-9 pt-9 shadow-[0_8px_24px_rgba(10,10,10,0.08),0_2px_6px_rgba(10,10,10,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.42),0_2px_6px_rgba(0,0,0,0.32)]"
      >
        <GridBackdrop />

        <div className="relative flex flex-col items-center gap-3 px-9 py-8 text-center">
          <h2 className="text-2xl leading-5 font-medium tracking-[-0.01em] text-foreground">
            No projects yet
          </h2>
          <p className="max-w-[320px] text-xs leading-5 text-muted-foreground">
            In the sidebar, click{' '}
            <AddProjectIcon
              anchorId="copy"
              className="mx-1"
              interactive
              onAddProject={props.onAddProject}
            />{' '}
            next to Projects to add your first project.
          </p>
        </div>

        <AppPreview onAddProject={props.onAddProject} />
      </div>
    </div>
  );
}

/**
 * Faint line grid behind the preview. A single element with a repeating-gradient
 * background keyed to `--color-border`, masked so it fades out under the text.
 */
function GridBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'repeating-linear-gradient(to right, transparent 0 31px, var(--color-border) 31px 32px), repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-border) 31px 32px)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, transparent 32%, #000 50%, #000 100%)',
        maskImage:
          'linear-gradient(to bottom, transparent 0%, transparent 32%, #000 50%, #000 100%)',
      }}
    />
  );
}

/**
 * Cropped top-left "screenshot" of the yyork app. Inset on the top/left (the
 * window corner) and bleeding off the right/bottom for a real screenshot feel.
 * The crop is full-bleed horizontally (424px) inside the padded card.
 */
function AppPreview(props: {
  onAddProject?: (source?: AddProjectSource) => void | Promise<void>;
}) {
  return (
    <div className="relative flex h-[253px] w-[424px] items-start justify-start overflow-hidden pt-[26px] pl-14">
      <div className="relative flex w-[368px] shrink-0 flex-col overflow-visible rounded-tl-xl border-t border-l border-border bg-background shadow-[0_16px_40px_rgba(10,10,10,0.14),0_2px_8px_rgba(10,10,10,0.08)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.4)]">
        {/* Header */}
        <div
          aria-hidden="true"
          className="flex h-[46px] shrink-0 self-stretch border-b border-border bg-sidebar"
        >
          <div className="flex w-[200px] shrink-0 items-center justify-between border-r border-border px-3">
            <PanelLeftIcon className="size-[17px] text-muted-foreground" />
            <div className="flex items-center gap-2 text-muted-foreground/70">
              <ArrowLeftIcon className="size-4" />
              <ArrowRightIcon className="size-4" />
            </div>
          </div>
          <div className="flex min-w-0 grow items-center gap-2 px-3.5">
            <span className="text-base leading-6 font-bold text-sidebar-foreground">
              yyork
            </span>
            <span className="flex items-center rounded-full border border-sidebar-border bg-sidebar-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-sidebar-primary-foreground">
              alpha
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex h-[180px] shrink-0">
          <div className="flex w-[200px] shrink-0 flex-col gap-[18px] border-r border-border bg-sidebar px-3 py-3.5">
            <div aria-hidden="true" className="flex flex-col gap-2">
              <span className="text-xs leading-4 font-medium text-muted-foreground">
                Pinned
              </span>
              <span className="pl-0.5 text-[13px] leading-4 text-muted-foreground/55">
                No pinned sessions
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex h-5 items-center justify-between">
                <span
                  aria-hidden="true"
                  className="text-xs leading-4 font-medium text-muted-foreground"
                >
                  Projects
                </span>
                <AddProjectIcon
                  anchorId="preview"
                  interactive
                  onAddProject={props.onAddProject}
                />
              </div>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="flex grow overflow-hidden bg-background"
          >
            <BoardColumn label="Working" />
          </div>
        </div>

        <PointerCursor className="pointer-events-none absolute top-[130px] left-[172px]" />
        <AddProjectCallout className="pointer-events-none absolute top-[150px] left-14" />
      </div>
    </div>
  );
}

const AddProjectIcon = forwardRef(function AddProjectIcon(
  props: {
    anchorId: AddProjectAnchorId;
    className?: string;
    interactive?: boolean;
    onAddProject?: (source?: AddProjectSource) => void | Promise<void>;
  },
  ref: ForwardedRef<HTMLButtonElement>
) {
  const className = cn(
    'inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-sidebar-accent align-[-0.125em] ring-1 ring-border',
    props.interactive &&
      'cursor-pointer outline-hidden hover:bg-sidebar-accent/80 focus-visible:ring-2 focus-visible:ring-sidebar-ring',
    props.className
  );

  if (props.interactive) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Add project"
        className={className}
        {...{ [ADD_PROJECT_ANCHOR_ATTR]: props.anchorId }}
        onClick={(event) => {
          void props.onAddProject?.({ anchorEl: event.currentTarget });
        }}
      >
        <PlusIcon
          aria-hidden="true"
          className="size-3.5 text-sidebar-accent-foreground"
        />
      </button>
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      <PlusIcon className="size-3.5 text-sidebar-accent-foreground" />
    </span>
  );
});

function AddProjectCallout(props: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex items-center gap-2 rounded-lg bg-neutral-900 py-1.5 pr-[9px] pl-[11px] shadow-[0_10px_24px_rgba(10,10,10,0.28)] dark:border dark:border-neutral-700 dark:bg-neutral-800',
        props.className
      )}
    >
      <span className="absolute -top-[3px] left-[120px] size-2 rotate-45 rounded-[1px] bg-neutral-900 dark:bg-neutral-800" />
      <span className="text-xs leading-4 font-medium text-neutral-50">
        Add project
      </span>
      <ShortcutKbdGroup
        hotkey={appHotkeys.addProject}
        className="flex items-center gap-[3px]"
        kbdClassName="h-[18px] min-w-[18px] rounded-[5px] bg-white/10 text-neutral-200"
      />
    </div>
  );
}

function BoardColumn(props: { label: string }) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-3 border-r border-border p-3.5">
      <div className="flex w-full items-center justify-between">
        <span className="text-[13px] leading-4 font-medium text-muted-foreground">
          {props.label}
        </span>
        <span className="text-[11px] leading-[14px] font-medium text-muted-foreground/60">
          0
        </span>
      </div>
    </div>
  );
}

/** Filled hand pointer (Phosphor "hand-pointing") used as a faux cursor. */
function PointerCursor(props: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('size-5', props.className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 256 256"
      >
        <path
          d="M196,88a27.86,27.86,0,0,0-13.35,3.39A28,28,0,0,0,144,74.7V44a28,28,0,0,0-56,0v80l-3.82-6.13A28,28,0,0,0,35.73,146l4.67,8.23C74.81,214.89,89.05,240,136,240a88.1,88.1,0,0,0,88-88V116A28,28,0,0,0,196,88Z"
          fill="#FFFFFF"
        />
        <path
          d="M196,88a27.86,27.86,0,0,0-13.35,3.39A28,28,0,0,0,144,74.7V44a28,28,0,0,0-56,0v80l-3.82-6.13A28,28,0,0,0,35.73,146l4.67,8.23C74.81,214.89,89.05,240,136,240a88.1,88.1,0,0,0,88-88V116A28,28,0,0,0,196,88Zm12,64a72.08,72.08,0,0,1-72,72c-37.63,0-47.84-18-81.68-77.68l-4.69-8.27,0-.05A12,12,0,0,1,54,121.61a11.88,11.88,0,0,1,6-1.6,12,12,0,0,1,10.41,6,1.76,1.76,0,0,0,.14.23l18.67,30A8,8,0,0,0,104,152V44a12,12,0,0,1,24,0v68a8,8,0,0,0,16,0V100a12,12,0,0,1,24,0v20a8,8,0,0,0,16,0v-4a12,12,0,0,1,24,0Z"
          fill="#0A0A0A"
        />
      </svg>
    </span>
  );
}
