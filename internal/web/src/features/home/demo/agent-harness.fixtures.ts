import type { AgentHarnessOption } from '@/features/home/domain/agent-harness';

export const sampleAgentHarnesses: AgentHarnessOption[] = [
  {
    availability: 'available',
    command: '/opt/homebrew/bin/claude',
    iconUrl: '/agent-icons/claude-agent.svg',
    id: 'claude-code',
    label: 'Claude Code',
    provider: 'Anthropic CLI',
  },
  {
    availability: 'available',
    command: '/opt/homebrew/bin/codex',
    iconUrl: '/agent-icons/codex-agent.svg',
    id: 'codex',
    label: 'Codex',
    provider: 'OpenAI CLI',
  },
  {
    // The Cursor harness plugin is not implemented yet, so it stays selectable-but-disabled.
    availability: 'unavailable',
    command: 'agent',
    iconUrl: '/agent-icons/cursor-agent.svg',
    id: 'cursor',
    label: 'Cursor',
    provider: 'Cursor',
  },
];
