import type { ReactNode } from 'react';

import { cn } from '@/lib/tailwind/utils';

/** Matches `NoProjectsEmptyState` card shell (424×438; scale applied by shell wrapper). */
export const projectSetupCardClassName =
  'relative flex h-[438px] w-[424px] flex-col overflow-hidden rounded-2xl border border-border bg-background p-9 shadow-[0_8px_24px_rgba(10,10,10,0.08),0_2px_6px_rgba(10,10,10,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.42),0_2px_6px_rgba(0,0,0,0.32)]';

export const projectSetupCardShellViewTransitionName = 'project-setup-card';

/**
 * Shared card shell for first-run empty-state evolution and embedded project
 * setup.
 */
export function ProjectSetupCardShell(props: {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
  viewTransitionName?: string;
}) {
  return (
    <div
      style={
        props.viewTransitionName
          ? { viewTransitionName: props.viewTransitionName }
          : undefined
      }
      className="shrink-0 origin-center scale-[1.15]"
    >
      <div
        data-testid={props['data-testid']}
        className={cn(projectSetupCardClassName, props.className)}
      >
        {props.children}
      </div>
    </div>
  );
}
