import {
  FileTextIcon,
  GlobeIcon,
  ListTodoIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
} from 'lucide-react';

import { cn } from '@/lib/tailwind/utils';

import { DotmCircular5 } from '@/components/ui/dotm-circular-5';

import type { KanbanCardData } from '@/features/home/domain/session-workspace';
import type {
  ParsedToolCall,
  ToolCallKind,
} from '@/features/home/domain/tool-call-bulletin';

const agentIconUrls: Record<string, string> = {
  'claude-code': '/agent-icons/claude-agent.svg',
  claude: '/agent-icons/claude-agent.svg',
  codex: '/agent-icons/codex-agent.svg',
};

function ToolLineIcon(props: { kind: ToolCallKind; running: boolean }) {
  if (props.running) {
    return (
      <DotmCircular5
        animated
        ariaLabel="Tool call in progress"
        className="size-3 shrink-0 text-foreground"
        dotSize={2}
        size={12}
      />
    );
  }

  if (props.kind === 'read') {
    return (
      <FileTextIcon
        aria-hidden
        className="size-3 shrink-0 text-foreground"
        strokeWidth={1}
      />
    );
  }

  if (props.kind === 'edit') {
    return (
      <PencilIcon
        aria-hidden
        className="size-3 shrink-0 text-foreground"
        strokeWidth={1}
      />
    );
  }

  if (props.kind === 'search' || props.kind === 'web-search') {
    return (
      <SearchIcon
        aria-hidden
        className="size-3 shrink-0 text-foreground"
        strokeWidth={1}
      />
    );
  }

  if (props.kind === 'web-fetch') {
    return (
      <GlobeIcon
        aria-hidden
        className="size-3 shrink-0 text-foreground"
        strokeWidth={1}
      />
    );
  }

  if (props.kind === 'checklist') {
    return (
      <ListTodoIcon
        aria-hidden
        className="size-3 shrink-0 text-foreground"
        strokeWidth={1}
      />
    );
  }

  return (
    <TerminalIcon
      aria-hidden
      className="size-3 shrink-0 text-muted-foreground"
      strokeWidth={1}
    />
  );
}

function ActiveToolCallPanel(props: { toolCall: ParsedToolCall }) {
  const { toolCall } = props;

  return (
    <div className="flex min-w-0 items-start gap-1.5 rounded-sm bg-muted/50 px-1 py-0.5">
      <span className="mt-0.5 flex shrink-0">
        <ToolLineIcon kind={toolCall.kind} running={toolCall.running} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] leading-3 tracking-wide text-foreground/80 uppercase">
          {toolCall.label}
        </span>
        {toolCall.detail ? (
          <span className="truncate font-mono text-[11px] leading-4 text-foreground">
            {toolCall.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function WorkingSessionCardV2(props: {
  card: KanbanCardData;
  onSelect?: (selectionKey: string) => void;
}) {
  const { card } = props;
  const agentIconUrl = agentIconUrls[card.agent];

  return (
    <button
      type="button"
      aria-label={`${card.agentLabel} session ${card.shortId}: ${card.task}`}
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 border-b border-border bg-background p-2 text-left text-foreground',
        'transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        card.selected && 'bg-accent hover:bg-accent'
      )}
      aria-current={card.selected ? 'true' : undefined}
      onClick={() => props.onSelect?.(card.selectionKey)}
    >
      <p className="line-clamp-2 text-sm leading-5 font-medium">{card.task}</p>

      {card.activeToolCall ? (
        <ActiveToolCallPanel toolCall={card.activeToolCall} />
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

export { WorkingSessionCardV2 };
