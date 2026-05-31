import { cn } from '@/lib/tailwind/utils';

import { KanbanCard } from '@/features/home/components/molecules/kanban-card';
import type { KanbanColumnData } from '@/features/home/domain/session-workspace';

export function KanbanColumn(props: {
  column: KanbanColumnData;
  isLast?: boolean;
  onSessionSelect?: (selectionKey: string) => void;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col px-3',
        !props.isLast && 'border-r border-border'
      )}
      aria-label={`${props.column.title} column`}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2 text-xs leading-4 text-accent-foreground">
        <h2 className="truncate font-normal">{props.column.title}</h2>
        <span className="shrink-0 text-accent-foreground/60">
          {props.column.cards.length}
        </span>
      </header>

      <div className="min-h-0 flex-1">
        {props.column.cards.map((card) => (
          <KanbanCard
            key={card.selectionKey}
            card={card}
            onSelect={props.onSessionSelect}
          />
        ))}
      </div>
    </section>
  );
}
