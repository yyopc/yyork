import type { ReactNode } from 'react';

const columnWidth = 266;

export function MockColumnShell(props: {
  children: ReactNode;
  count: number;
  label: string;
}) {
  return (
    <section
      className="flex w-[266px] min-w-0 flex-col border border-border bg-background"
      data-design="column"
      style={{ width: columnWidth }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-5 text-xs leading-4 text-accent-foreground">
        <h2 className="truncate font-normal">{props.label}</h2>
        <span className="shrink-0 text-accent-foreground/60">
          {props.count}
        </span>
      </header>
      <div className="min-h-0 flex-1">{props.children}</div>
    </section>
  );
}
