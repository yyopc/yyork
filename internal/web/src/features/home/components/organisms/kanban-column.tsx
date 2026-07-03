import { cn } from '@/lib/tailwind/utils';

import type { KanbanSessionActionProps } from '@/features/home/components/molecules/kanban-card';
import { KanbanCard } from '@/features/home/components/molecules/kanban-card';
import type { KanbanColumnData } from '@/features/home/domain/session-workspace';

export function KanbanColumn(
  props: {
    column: KanbanColumnData;
    isLast?: boolean;
    onSessionSelect?: (selectionKey: string) => void;
  } & KanbanSessionActionProps
) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden px-3',
        !props.isLast && 'border-r border-border'
      )}
      aria-label={`${props.column.title} column`}
    >
      <header className="sticky top-0 z-10 flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-2 text-xs leading-4 text-accent-foreground">
        <h2 className="truncate font-normal">{props.column.title}</h2>
        <span className="shrink-0 text-accent-foreground/60">
          {props.column.cards.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 scroll-fade-y overflow-y-auto overscroll-contain [--scroll-fade-reveal:calc(var(--spacing)*6)] scroll-fade-6">
        {props.column.cards.map((card) => (
          <KanbanCard
            key={card.selectionKey}
            card={card}
            onSelect={props.onSessionSelect}
            onTerminalSessionDelete={props.onTerminalSessionDelete}
            onTerminalSessionHide={props.onTerminalSessionHide}
            onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
            onTerminalSessionOpenDetached={props.onTerminalSessionOpenDetached}
            onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
            onTerminalSessionRename={props.onTerminalSessionRename}
            onTerminalSessionRestart={props.onTerminalSessionRestart}
            pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys}
          />
        ))}
      </div>
    </section>
  );
}
