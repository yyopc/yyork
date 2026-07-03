import type { ReactNode } from 'react';

import { MockColumnShell } from './mock-column-shell';

export function ComparisonPanel(props: {
  baseline: ReactNode;
  label: string;
  next: ReactNode;
  third?: ReactNode;
  thirdLabel?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-medium">{props.label}</h3>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <MockColumnShell count={1} label="Working">
            {props.baseline}
          </MockColumnShell>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">V2 exploration</p>
          <MockColumnShell count={1} label="Working">
            {props.next}
          </MockColumnShell>
        </div>
        {props.third ? (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {props.thirdLabel ?? 'V3 exploration'}
            </p>
            <MockColumnShell count={1} label="Working">
              {props.third}
            </MockColumnShell>
          </div>
        ) : null}
      </div>
    </section>
  );
}
