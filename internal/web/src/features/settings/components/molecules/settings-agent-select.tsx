import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

import type {
  AgentHarnessAvailability,
  AgentHarnessId,
} from '@/features/home/domain/agent-harness';

const agentOptions: Array<{
  availability: AgentHarnessAvailability;
  iconPath: string;
  id: AgentHarnessId;
  label: string;
}> = [
  {
    availability: 'available',
    iconPath: '/agent-icons/claude-agent.svg',
    id: 'claude-code',
    label: 'Claude Code',
  },
  {
    availability: 'available',
    iconPath: '/agent-icons/codex-agent.svg',
    id: 'codex',
    label: 'Codex',
  },
  {
    // The Cursor harness plugin is not implemented yet, so it stays selectable-but-disabled.
    availability: 'unavailable',
    iconPath: '/agent-icons/cursor-agent.svg',
    id: 'cursor',
    label: 'Cursor',
  },
];

export function SettingsAgentSelect(props: {
  label: string;
  onValueChange: (value: AgentHarnessId) => void;
  testId: string;
  value: AgentHarnessId;
}) {
  const selectedAgent = agentOptions.find((agent) => agent.id === props.value);

  return (
    <Select
      items={agentOptions.map((agent) => ({
        disabled: agent.availability === 'unavailable',
        label: agent.label,
        value: agent.id,
      }))}
      value={props.value}
      onValueChange={(value) => {
        // Resolve against agentOptions so new harness ids never need a literal guard here.
        const nextAgent = agentOptions.find((agent) => agent.id === value);
        if (nextAgent && nextAgent.availability === 'available') {
          props.onValueChange(nextAgent.id);
        }
      }}
    >
      <SelectTrigger
        aria-label={props.label}
        className="w-full rounded-sm shadow-none"
        data-testid={props.testId}
        size="sm"
      >
        {selectedAgent ? <AgentOption {...selectedAgent} /> : null}
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {agentOptions.map((agent) => (
            <SelectItem
              key={agent.id}
              data-value={agent.id}
              disabled={agent.availability === 'unavailable'}
              value={agent.id}
            >
              <AgentOption {...agent} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AgentOption(props: { iconPath: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        alt=""
        aria-hidden="true"
        className="size-3 shrink-0 invert dark:invert-0"
        src={props.iconPath}
      />
      <span className="truncate">{props.label}</span>
    </span>
  );
}
