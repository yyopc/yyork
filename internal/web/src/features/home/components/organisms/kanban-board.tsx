import { cn } from '@/lib/tailwind/utils';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { KanbanSessionActionProps } from '@/features/home/components/molecules/kanban-card';
import { KanbanColumn } from '@/features/home/components/organisms/kanban-column';
import type { KanbanColumnData } from '@/features/home/domain/session-workspace';

export function KanbanBoard(
  props: {
    className?: string;
    columns: KanbanColumnData[];
    onSessionSelect?: (selectionKey: string) => void;
  } & KanbanSessionActionProps
) {
  return (
    <section
      className={cn(
        'min-h-0 min-w-0 border-r border-border bg-background',
        props.className
      )}
      aria-label="Kanban board"
    >
      <ScrollArea
        className="h-full w-full min-w-0"
        contentClassName="h-full"
        orientation="horizontal"
      >
        <div className="grid h-full w-full min-w-[960px] grid-cols-4 bg-background">
          {props.columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              isLast={index === props.columns.length - 1}
              onSessionSelect={props.onSessionSelect}
              onTerminalSessionDelete={props.onTerminalSessionDelete}
              onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
              onTerminalSessionOpenDetached={
                props.onTerminalSessionOpenDetached
              }
              onTerminalSessionPinToggle={props.onTerminalSessionPinToggle}
              onTerminalSessionRename={props.onTerminalSessionRename}
              onTerminalSessionRestart={props.onTerminalSessionRestart}
              pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys}
            />
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
