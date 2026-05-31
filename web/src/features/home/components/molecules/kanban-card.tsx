import { cn } from '@/lib/tailwind/utils';

import type { KanbanCardData } from '@/features/home/domain/session-workspace';

// The backend emits the agent plugin id verbatim, so the claude plugin reports
// "claude-code" (not "claude") — see session-workspace.unit.spec.ts. Key the icon
// map by the actual plugin ids so the claude card resolves to its icon instead of
// falling back to the "C" letter.
const agentIconUrls: Record<string, string> = {
  'claude-code': '/agent-icons/claude-agent.svg',
  claude: '/agent-icons/claude-agent.svg',
  codex: '/agent-icons/codex-agent.svg',
};

export function KanbanCard(props: {
  card: KanbanCardData;
  onSelect?: (selectionKey: string) => void;
}) {
  const agentIconUrl = agentIconUrls[props.card.agent];

  return (
    <button
      type="button"
      aria-label={`${props.card.workerId} ${props.card.title}`}
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 border-b border-border bg-background p-2 text-left text-foreground',
        'transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        props.card.selected && 'bg-accent hover:bg-accent'
      )}
      aria-current={props.card.selected ? 'true' : undefined}
      onClick={() => props.onSelect?.(props.card.selectionKey)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 text-xs leading-4">
        <span className="w-[110px] shrink-0 truncate">{props.card.issue}</span>
        <span className="min-w-0 truncate text-right">
          {props.card.metadata}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="truncate text-sm leading-5 font-medium">
          {props.card.title}
        </h3>
        <p className="text-xs leading-4 break-words text-muted-foreground">
          {props.card.description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs leading-4">
        <span className="flex size-3 items-center justify-center">
          {agentIconUrl ? (
            <img
              src={agentIconUrl}
              alt=""
              className="size-3 invert dark:invert-0"
              aria-hidden="true"
            />
          ) : (
            <span aria-hidden="true" className="text-[10px] leading-none">
              {props.card.agent.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="sr-only">{props.card.agent}</span>
        </span>
        <span className="shrink-0">{props.card.workerId}</span>
      </div>
    </button>
  );
}
