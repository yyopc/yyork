import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

import type { AgentHarnessId } from '@/features/home/domain/agent-harness';

const agentOptions: Array<{
  iconPath: string;
  id: AgentHarnessId;
  label: string;
}> = [
  {
    iconPath: '/agent-icons/claude-agent.svg',
    id: 'claude-code',
    label: 'Claude Code',
  },
  {
    iconPath: '/agent-icons/codex-agent.svg',
    id: 'codex',
    label: 'Codex',
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
        label: agent.label,
        value: agent.id,
      }))}
      value={props.value}
      onValueChange={(value) => {
        if (value === 'claude-code' || value === 'codex') {
          props.onValueChange(value);
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
            <SelectItem key={agent.id} data-value={agent.id} value={agent.id}>
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
