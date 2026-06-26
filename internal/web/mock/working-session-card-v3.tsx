import { cn } from '@/lib/tailwind/utils';

import { ToolCallBulletinLine } from '@/features/home/components/molecules/tool-call-bulletin-line';
import type { KanbanCardData } from '@/features/home/domain/session-workspace';

const agentIconUrls: Record<string, string> = {
  'claude-code': '/agent-icons/claude-agent.svg',
  claude: '/agent-icons/claude-agent.svg',
  codex: '/agent-icons/codex-agent.svg',
};

function WorkingSessionCardV3(props: {
  card: KanbanCardData;
  onSelect?: (selectionKey: string) => void;
}) {
  const { card } = props;
  const agentIconUrl = agentIconUrls[card.agent];
  const showsWorkingToolBulletin =
    card.activity === 'working' && Boolean(card.activeToolCallLabel);

  return (
    <button
      type="button"
      aria-label={`${card.agentLabel} session ${card.shortId}: ${card.task}`}
      className={cn(
        'group/card flex w-full min-w-0 flex-col gap-2 border-b border-border bg-background p-2 text-left text-foreground',
        'transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        card.selected && 'bg-accent hover:bg-accent'
      )}
      aria-current={card.selected ? 'true' : undefined}
      onClick={() => props.onSelect?.(card.selectionKey)}
    >
      <p className="line-clamp-2 text-sm leading-5 font-medium">{card.task}</p>

      {showsWorkingToolBulletin ? (
        <ToolCallBulletinLine text={card.activeToolCallLabel!} />
      ) : card.recap ? (
        <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
          {card.recap}
        </p>
      ) : null}

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

export { WorkingSessionCardV3 };
