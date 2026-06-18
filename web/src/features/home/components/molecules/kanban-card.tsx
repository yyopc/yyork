import { cn } from '@/lib/tailwind/utils';

import type { KanbanCardData } from '@/features/home/domain/session-workspace';

const agentIconUrls: Record<string, string> = {
  'claude-code': '/agent-icons/claude-agent.svg',
  claude: '/agent-icons/claude-agent.svg',
  codex: '/agent-icons/codex-agent.svg',
};

export function KanbanCard(props: {
  card: KanbanCardData;
  onSelect?: (selectionKey: string) => void;
}) {
  const { card } = props;
  const agentIconUrl = agentIconUrls[card.agent];
  const ariaLabel = card.description
    ? `${card.agentLabel} session ${card.shortId}: ${card.task}. ${card.description}`
    : `${card.agentLabel} session ${card.shortId}: ${card.task}`;
  const hasDescription = card.descriptionLines.length > 0;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 border-b border-border bg-background p-2 text-left text-foreground',
        'transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        card.selected && 'bg-accent hover:bg-accent'
      )}
      aria-current={card.selected ? 'true' : undefined}
      onClick={() => props.onSelect?.(card.selectionKey)}
    >
      <div className={cn('flex min-w-0 flex-col', hasDescription && 'gap-1')}>
        <p className="line-clamp-2 text-sm leading-5 font-medium">
          {card.task}
        </p>
        {card.descriptionLines.length === 1 ? (
          <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {card.descriptionLines[0]}
          </p>
        ) : null}
        {card.descriptionLines.length > 1 ? (
          <ul className="flex min-w-0 flex-col gap-0.5 text-xs leading-4 text-muted-foreground">
            {card.descriptionLines.map((line) => (
              <li key={line} className="flex min-w-0 items-start gap-1.5">
                <span className="mt-[0.4375rem] size-1 shrink-0 rounded-full bg-muted-foreground/55" />
                <span className="min-w-0 truncate">{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 text-xs leading-4">
        <span className="flex shrink-0 items-center">
          {agentIconUrl ? (
            <img
              src={agentIconUrl}
              alt={card.agentLabel}
              className="size-3 invert dark:invert-0"
            />
          ) : (
            <span
              aria-label={card.agentLabel}
              className="flex size-3 items-center justify-center text-[10px] leading-none"
            >
              {card.agent.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {card.shortId}
        </span>
      </div>
    </button>
  );
}
