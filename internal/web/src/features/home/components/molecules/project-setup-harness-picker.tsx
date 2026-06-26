import { ArrowRightIcon, BotIcon, ChevronLeftIcon } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type {
  AgentHarnessId,
  AgentHarnessOption,
} from '@/features/home/domain/agent-harness';

export function ProjectSetupHarnessPicker(props: {
  className?: string;
  harnesses: AgentHarnessOption[];
  onCancel?: () => void;
  onChangeProject?: () => void;
  onRememberOrchestratorDefaultChange: (remember: boolean) => void;
  onRememberWorkerDefaultChange: (remember: boolean) => void;
  onOrchestratorChange: (harnessId: AgentHarnessId) => void;
  onStartProject?: () => void;
  onWorkerChange: (harnessId: AgentHarnessId) => void;
  orchestratorHarnessId: AgentHarnessId;
  projectPath: string;
  rememberOrchestratorDefault: boolean;
  rememberWorkerDefault: boolean;
  starting?: boolean;
  workerHarnessId: AgentHarnessId;
}) {
  const orchestratorLabelId = useId();
  const workerLabelId = useId();
  const rememberOrchestratorId = useId();
  const rememberWorkerId = useId();

  const canStart =
    isHarnessAvailable(props.harnesses, props.orchestratorHarnessId) &&
    isHarnessAvailable(props.harnesses, props.workerHarnessId);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4', props.className)}>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl leading-5 font-medium tracking-[-0.01em] text-foreground">
            Agents
          </h2>
          {props.onChangeProject ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-sm text-muted-foreground shadow-none"
              aria-label="Change project"
              onClick={props.onChangeProject}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Choose orchestrator and worker agents for this project:
        </p>
        <code className="block w-full truncate rounded-sm border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-xs text-foreground">
          {props.projectPath}
        </code>
      </header>

      <HarnessSelectField
        harnesses={props.harnesses}
        label="Orchestrator agent"
        labelId={orchestratorLabelId}
        rememberChecked={props.rememberOrchestratorDefault}
        rememberId={rememberOrchestratorId}
        rememberLabel="Remember for new projects"
        selectedId={props.orchestratorHarnessId}
        onRememberChange={props.onRememberOrchestratorDefaultChange}
        onSelect={props.onOrchestratorChange}
      />

      <HarnessSelectField
        harnesses={props.harnesses}
        label="Worker agent"
        labelId={workerLabelId}
        rememberChecked={props.rememberWorkerDefault}
        rememberId={rememberWorkerId}
        rememberLabel="Remember for new projects"
        selectedId={props.workerHarnessId}
        onRememberChange={props.onRememberWorkerDefaultChange}
        onSelect={props.onWorkerChange}
      />

      <div className="mt-auto flex items-center justify-end gap-2">
        {props.onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={props.onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!canStart}
          loading={props.starting}
          onClick={props.onStartProject}
        >
          Start project
          <ArrowRightIcon
            aria-hidden="true"
            className="size-4 [stroke-width:2]"
            data-icon="inline-end"
          />
        </Button>
      </div>
    </div>
  );
}

function HarnessSelectField(props: {
  harnesses: AgentHarnessOption[];
  label: string;
  labelId: string;
  onRememberChange: (remember: boolean) => void;
  onSelect: (harnessId: AgentHarnessId) => void;
  rememberChecked: boolean;
  rememberId: string;
  rememberLabel: string;
  selectedId: AgentHarnessId;
}) {
  const selectItems = props.harnesses.map((harness) => ({
    disabled: harness.availability === 'unavailable',
    label: harness.label,
    value: harness.id,
  }));
  const selectedHarness = props.harnesses.find(
    (harness) => harness.id === props.selectedId
  );

  return (
    <div className="flex flex-col gap-2">
      <label
        id={props.labelId}
        className="text-xs font-medium text-muted-foreground"
      >
        {props.label}
      </label>
      <Select
        items={selectItems}
        value={props.selectedId}
        onValueChange={(value) => {
          if (value) {
            props.onSelect(value as AgentHarnessId);
          }
        }}
      >
        <SelectTrigger
          className="w-full"
          size="sm"
          aria-labelledby={props.labelId}
        >
          {selectedHarness ? (
            <HarnessSelectOption harness={selectedHarness} />
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {props.harnesses.map((harness) => (
              <SelectItem
                key={harness.id}
                value={harness.id}
                disabled={harness.availability === 'unavailable'}
              >
                <HarnessSelectOption harness={harness} />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Checkbox
        checked={props.rememberChecked}
        size="sm"
        onCheckedChange={(checked) => {
          props.onRememberChange(checked === true);
        }}
        labelProps={{
          // Mirror SelectTrigger border + pl-2.5 so the box aligns with the agent icon.
          className: 'border-l border-transparent pl-2.5',
          id: props.rememberId,
        }}
      >
        <span className="leading-5 text-muted-foreground">
          {props.rememberLabel}
        </span>
      </Checkbox>
    </div>
  );
}

function isHarnessAvailable(
  harnesses: AgentHarnessOption[],
  harnessId: AgentHarnessId
) {
  return harnesses.some(
    (harness) =>
      harness.id === harnessId && harness.availability === 'available'
  );
}

function HarnessSelectOption(props: { harness: AgentHarnessOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <HarnessIcon harness={props.harness} />
      <span className="truncate">{props.harness.label}</span>
    </span>
  );
}

function HarnessIcon(props: { harness: AgentHarnessOption }) {
  if (props.harness.iconUrl) {
    return (
      <img
        src={props.harness.iconUrl}
        alt=""
        className="size-4 shrink-0 invert dark:invert-0"
        draggable={false}
      />
    );
  }

  return (
    <BotIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
    />
  );
}
