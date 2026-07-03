import { cn } from '@/lib/tailwind/utils';

import { HoverCard } from '@/components/ui/hover-card';
import { HoverCardContent } from '@/components/ui/hover-card-content';
import { HoverCardTrigger } from '@/components/ui/hover-card-trigger';

import { SessionContextMenu } from '@/features/home/components/molecules/session-context-menu';
import { ToolCallBulletinLine } from '@/features/home/components/molecules/tool-call-bulletin-line';
import { WorkerResponseAttentionIndicator } from '@/features/home/components/molecules/worker-response-attention-indicator';
import type { KanbanCardData } from '@/features/home/domain/session-workspace';

const agentIconUrls: Record<string, string> = {
  'claude-code': '/agent-icons/claude-agent.svg',
  claude: '/agent-icons/claude-agent.svg',
  codex: '/agent-icons/codex-agent.svg',
};

export interface KanbanSessionActionProps {
  onTerminalSessionDelete?: (selectionKey: string, label: string) => void;
  onTerminalSessionHide?: (selectionKey: string, label: string) => void;
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionPinToggle?: (selectionKey: string) => void;
  onTerminalSessionRename?: (selectionKey: string, label: string) => void;
  onTerminalSessionRestart?: (selectionKey: string, label: string) => void;
  pinnedTerminalSessionKeys?: string[];
}

export function KanbanCard(
  props: {
    card: KanbanCardData;
    onSelect?: (selectionKey: string) => void;
  } & KanbanSessionActionProps
) {
  const { card } = props;
  const agentIconUrl = agentIconUrls[card.agent];
  const showsWorkingToolBulletin =
    card.activity === 'working' && Boolean(card.activeToolCallLabel);
  const ariaDescription = showsWorkingToolBulletin
    ? card.activeToolCallLabel
    : card.description;
  const ariaDetails = [ariaDescription, card.responseAttention?.label]
    .filter(Boolean)
    .join('. ');
  const ariaLabel = ariaDetails
    ? `${card.agentLabel} session ${card.shortId}: ${card.task}. ${ariaDetails}`
    : `${card.agentLabel} session ${card.shortId}: ${card.task}`;
  const hasDescription =
    showsWorkingToolBulletin || card.descriptionLines.length > 0;
  const showsRecapPreview =
    card.recap.trim() !== '' &&
    card.recapPreview.trim() !== '' &&
    card.descriptionLines.includes(card.recapPreview);

  const cardButton = (
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
        {showsWorkingToolBulletin ? (
          <ToolCallBulletinLine text={card.activeToolCallLabel!} />
        ) : null}
        {!showsWorkingToolBulletin && card.descriptionLines.length === 1 ? (
          <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {card.descriptionLines[0]}
          </p>
        ) : null}
        {!showsWorkingToolBulletin && card.descriptionLines.length > 1 ? (
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
        <span className="flex shrink-0 items-center gap-1">
          <WorkerResponseAttentionIndicator
            attention={card.responseAttention}
            size="card"
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.shortId}
          </span>
        </span>
      </div>
    </button>
  );

  const cardContent = showsRecapPreview ? (
    <HoverCard>
      <HoverCardTrigger delay={300} closeDelay={100} render={cardButton} />
      <HoverCardContent
        side="right"
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] p-3 text-xs leading-5"
      >
        <p className="break-words whitespace-normal">{card.recap}</p>
      </HoverCardContent>
    </HoverCard>
  ) : (
    cardButton
  );

  if (!props.onSelect) {
    return cardContent;
  }

  const sessionLabel = card.task;
  const openSession = () => props.onSelect?.(card.selectionKey);

  return (
    <SessionContextMenu
      isPinned={(props.pinnedTerminalSessionKeys ?? []).includes(
        card.selectionKey
      )}
      onOpen={openSession}
      onOpenDetached={
        props.onTerminalSessionOpenDetached
          ? () => props.onTerminalSessionOpenDetached?.(card.selectionKey)
          : undefined
      }
      onPinToggle={
        props.onTerminalSessionPinToggle
          ? () => props.onTerminalSessionPinToggle?.(card.selectionKey)
          : undefined
      }
      onRename={
        props.onTerminalSessionRename
          ? () =>
              props.onTerminalSessionRename?.(card.selectionKey, sessionLabel)
          : undefined
      }
      onMarkDone={
        props.onTerminalSessionMarkDone && card.state === 'prompt'
          ? () =>
              props.onTerminalSessionMarkDone?.(card.selectionKey, sessionLabel)
          : undefined
      }
      onHide={
        props.onTerminalSessionHide
          ? () => props.onTerminalSessionHide?.(card.selectionKey, sessionLabel)
          : undefined
      }
      onDelete={
        props.onTerminalSessionDelete
          ? () =>
              props.onTerminalSessionDelete?.(card.selectionKey, sessionLabel)
          : undefined
      }
      onRestart={
        props.onTerminalSessionRestart
          ? () =>
              props.onTerminalSessionRestart?.(card.selectionKey, sessionLabel)
          : undefined
      }
    >
      {cardContent}
    </SessionContextMenu>
  );
}
