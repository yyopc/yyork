import { LaptopIcon, SplitIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

import {
  type AgentHarnessDefaults,
  readAgentHarnessDefaults,
  writeAgentHarnessDefaults,
} from '@/features/home/data/agent-harness-preferences';
import type { AgentHarnessId } from '@/features/home/domain/agent-harness';
import type { WorkerWorkspaceMode } from '@/features/home/domain/session-workspace';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';
import { SettingsAgentSelect } from '@/features/settings/components/molecules/settings-agent-select';
import { SettingsRow } from '@/features/settings/components/molecules/settings-row';
import { ThemeSelect } from '@/features/settings/components/molecules/theme-select';
import {
  readSettingsPreferences,
  writeSettingsPreferences,
} from '@/features/settings/data/settings-preferences';

const defaultAgentHarnesses: AgentHarnessDefaults = {
  orchestratorHarnessId: 'claude-code',
  workerHarnessId: 'codex',
};

export function SettingsPage() {
  const {
    confirmBeforeStoppingSessions,
    onConfirmBeforeStoppingSessionsChange,
  } = useWorkspaceContext();
  const [workspaceMode, setWorkspaceMode] = useState<WorkerWorkspaceMode>(
    () => readSettingsPreferences().defaultWorkerWorkspaceMode
  );
  const [agentDefaults, setAgentDefaults] = useState<AgentHarnessDefaults>(
    () => readAgentHarnessDefaults() ?? defaultAgentHarnesses
  );
  const handleWorkspaceModeChange = (value: string | null) => {
    if (value !== 'local' && value !== 'new-worktree') {
      return;
    }

    setWorkspaceMode(value);
    writeSettingsPreferences({ defaultWorkerWorkspaceMode: value });
  };

  const handleAgentChange = (
    role: keyof AgentHarnessDefaults,
    agentId: AgentHarnessId
  ) => {
    const nextDefaults = { ...agentDefaults, [role]: agentId };
    setAgentDefaults(nextDefaults);
    writeAgentHarnessDefaults(nextDefaults);
  };

  return (
    <main className="min-h-full overflow-y-auto bg-background px-6 pt-10 pb-20 text-foreground sm:px-12 lg:px-24 lg:pt-14">
      <div className="w-full max-w-190" data-testid="settings-page">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.02em]">
            Settings
          </h1>
          <p className="max-w-160 text-sm leading-5 text-muted-foreground">
            Choose how yyork behaves across projects and which agents it starts
            by default.
          </p>
        </header>

        <SettingsSection
          className="mt-11"
          description="Appearance, worker isolation, and safety."
          title="General"
        >
          <SettingsRow
            title="Theme"
            description="Match your system or choose a fixed appearance."
            control={<ThemeSelect />}
          />
          <SettingsRow
            title="Default worker workspace"
            description="Applied when a project does not specify where a worker starts."
            control={
              <Select
                items={[
                  { label: 'Work locally', value: 'local' },
                  { label: 'New worktree', value: 'new-worktree' },
                ]}
                value={workspaceMode}
                onValueChange={handleWorkspaceModeChange}
              >
                <SelectTrigger
                  aria-label="Default worker workspace"
                  className="w-full rounded-sm shadow-none"
                  data-testid="default-worker-workspace"
                  size="sm"
                >
                  <WorkspaceModeOption mode={workspaceMode} />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem data-value="local" value="local">
                      <WorkspaceModeOption mode="local" />
                    </SelectItem>
                    <SelectItem data-value="new-worktree" value="new-worktree">
                      <WorkspaceModeOption mode="new-worktree" />
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            title="Confirm before stopping sessions"
            description="Warn before terminating an agent and removing its worktree."
            control={
              <button
                aria-checked={confirmBeforeStoppingSessions}
                aria-label="Confirm before stopping sessions"
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  confirmBeforeStoppingSessions ? 'bg-primary' : 'bg-input'
                )}
                data-testid="confirm-before-stopping-sessions"
                role="switch"
                type="button"
                onClick={() =>
                  onConfirmBeforeStoppingSessionsChange(
                    !confirmBeforeStoppingSessions
                  )
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-xs transition-transform',
                    confirmBeforeStoppingSessions && 'translate-x-4'
                  )}
                />
              </button>
            }
          />
        </SettingsSection>

        <SettingsSection
          className="mt-9"
          description="Choose which installed agent yyork starts for each role."
          title="Agents"
        >
          <SettingsRow
            title="Default orchestrator"
            description="Coordinates new projects and delegates work."
            control={
              <SettingsAgentSelect
                label="Default orchestrator"
                testId="default-orchestrator"
                value={agentDefaults.orchestratorHarnessId}
                onValueChange={(agentId) =>
                  handleAgentChange('orchestratorHarnessId', agentId)
                }
              />
            }
          />
          <SettingsRow
            title="Default worker"
            description="Starts focused tasks delegated by an orchestrator."
            control={
              <SettingsAgentSelect
                label="Default worker"
                testId="default-worker"
                value={agentDefaults.workerHarnessId}
                onValueChange={(agentId) =>
                  handleAgentChange('workerHarnessId', agentId)
                }
              />
            }
          />
        </SettingsSection>
      </div>
    </main>
  );
}

function WorkspaceModeOption(props: { mode: WorkerWorkspaceMode }) {
  const isWorktree = props.mode === 'new-worktree';
  const Icon = isWorktree ? SplitIcon : LaptopIcon;

  return (
    <span className="flex items-center gap-2">
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3.5 text-muted-foreground',
          isWorktree && '-rotate-90'
        )}
      />
      <span>{isWorktree ? 'New worktree' : 'Work locally'}</span>
    </span>
  );
}

function SettingsSection(props: {
  children: ReactNode;
  className?: string;
  description: string;
  title: string;
}) {
  return (
    <section className={props.className}>
      <header className="border-b border-border pb-3.5">
        <h2 className="text-sm leading-5 font-semibold text-foreground">
          {props.title}
        </h2>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          {props.description}
        </p>
      </header>
      <div>{props.children}</div>
    </section>
  );
}
