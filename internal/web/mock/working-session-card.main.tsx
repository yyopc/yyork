import { type ReactNode, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/app.css';
import 'slot-text/style.css';

import { KanbanCard } from '@/features/home/components/molecules/kanban-card';
import {
  toKanbanCard,
  type WorkerSessionRecord,
} from '@/features/home/domain/session-workspace';

import { WorkingSessionCardV2 } from './working-session-card-v2';
import { WorkingSessionCardV3 } from './working-session-card-v3';

const COLUMN_WIDTH = 266;

const liveWorkingSession = {
  agent: 'codex',
  createdAt: '2026-06-24T00:20:00.000Z',
  cwd: '/Users/tanishqpalandurkar/Projects/yyork',
  description:
    'Tracing agent hook registration across internal packages and CLI entrypoints.',
  id: 'session-yyork-hooks',
  issue: '',
  metadata: JSON.stringify({
    activity: 'working',
    currentToolCall: 'Running file read: internal/cli/hooks.go',
    lastActivityAt: '2026-06-24T00:31:12.000Z',
    prompt:
      'Explain the current state of agent hooks in yyork from the current codebase.',
    recap:
      'Tracing agent hook registration across internal packages and CLI entrypoints.',
    toolCallBulletins: [
      'Running shell command: rg "summarizeToolCall" internal/cli internal/plugin',
      'Running file read: internal/cli/hooks.go',
      'Reading file: internal/plugin/agent/claudecode/hooks.go',
      'Finished shell command: nl -ba internal/session/prompts/orchestrator.md',
    ],
    title:
      'Explain the current state of agent hooks in yyork from the current codebase',
  }),
  project: 'yyork',
  recap:
    'Tracing agent hook registration across internal packages and CLI entrypoints.',
  selected: true,
  state: 'working',
  terminalSupported: true,
  title:
    'Explain the current state of agent hooks in yyork from the current codebase',
  updatedAt: '2026-06-24T00:31:12.000Z',
  workerId: 'worker-sx8qdy',
} satisfies WorkerSessionRecord;

const claudeWorkingSession = {
  agent: 'claude-code',
  createdAt: '2026-06-07T10:00:00.000Z',
  cwd: '/Users/tanishqpalandurkar/Projects/yyork',
  description:
    'Reading branch metadata files and wiring the dashboard projection.',
  id: 'session-ao-1',
  issue: '[Issue #23]',
  metadata: JSON.stringify({
    activity: 'working',
    currentToolCall:
      'Running shell command: rg branch internal internal/web/src/features/home',
    lastActivityAt: '2026-06-07T10:12:00.000Z',
    prompt:
      'Trace branch state and expose it consistently for dashboard state.',
    recap: 'Reading branch metadata files and wiring the dashboard projection.',
    toolCallBulletins: [
      'Running shell command: rg branch internal internal/web/src/features/home',
      'Running file read: internal/session/workspace_source.go',
      'Reading file: internal/web/src/features/home/domain/kanban-card-model.ts',
      'Finished file read: internal/web/src/features/home/domain/session-workspace.ts',
    ],
    title: 'Trace branch metadata',
  }),
  project: 'agent-orchestrator',
  recap: 'Reading branch metadata files and wiring the dashboard projection.',
  state: 'working',
  terminalSupported: true,
  title: 'Trace branch metadata',
  updatedAt: '2026-06-07T10:12:00.000Z',
  workerId: 'session-ao-1',
} satisfies WorkerSessionRecord;

const liveWorkingCard = toKanbanCard(liveWorkingSession);
const claudeWorkingCard = toKanbanCard(claudeWorkingSession);

function MockColumnShell(props: {
  children: ReactNode;
  count: number;
  label: string;
}) {
  return (
    <section
      className="flex w-[266px] min-w-0 flex-col border border-border bg-background"
      data-design="column"
      style={{ width: COLUMN_WIDTH }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-5 text-xs leading-4 text-accent-foreground">
        <h2 className="truncate font-normal">{props.label}</h2>
        <span className="shrink-0 text-accent-foreground/60">
          {props.count}
        </span>
      </header>
      <div className="min-h-0 flex-1">{props.children}</div>
    </section>
  );
}

function ComparisonPanel(props: {
  baseline: ReactNode;
  label: string;
  next: ReactNode;
  third?: ReactNode;
  thirdLabel?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-medium">{props.label}</h3>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <MockColumnShell count={1} label="Working">
            {props.baseline}
          </MockColumnShell>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">V2 exploration</p>
          <MockColumnShell count={1} label="Working">
            {props.next}
          </MockColumnShell>
        </div>
        {props.third ? (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {props.thirdLabel ?? 'V3 exploration'}
            </p>
            <MockColumnShell count={1} label="Working">
              {props.third}
            </MockColumnShell>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WorkingSessionCardMockPage() {
  const [selectedKey, setSelectedKey] = useState(liveWorkingCard.selectionKey);
  const claudeCard = {
    ...claudeWorkingCard,
    selected: selectedKey === claudeWorkingCard.selectionKey,
  };
  const liveCard = {
    ...liveWorkingCard,
    selected: selectedKey === liveWorkingCard.selectionKey,
  };

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-5xl min-w-0 flex-col gap-8 p-6 pb-16"
      data-design="canvas"
    >
      <header className="flex max-w-2xl flex-col gap-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          yyork mock
        </p>
        <h1 className="text-lg font-medium">Working session card</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Side-by-side comparison of the current kanban card, V2 (active tool
          call panel), and V3 (production-style bulletin with slot-text on live
          hook updates). Use the theme control for light/dark review; share with{' '}
          <code className="font-mono text-xs">?theme=dark</code>.
        </p>
      </header>

      <ComparisonPanel
        label="Live session (agent hooks task)"
        baseline={<KanbanCard card={liveCard} onSelect={setSelectedKey} />}
        next={
          <WorkingSessionCardV2 card={liveCard} onSelect={setSelectedKey} />
        }
        third={
          <WorkingSessionCardV3 card={liveCard} onSelect={setSelectedKey} />
        }
        thirdLabel="V3 moving bulletin (hover to pause)"
      />

      <ComparisonPanel
        label="Fixture: trace branch metadata"
        baseline={<KanbanCard card={claudeCard} onSelect={setSelectedKey} />}
        next={
          <WorkingSessionCardV2 card={claudeCard} onSelect={setSelectedKey} />
        }
        third={
          <WorkingSessionCardV3 card={claudeCard} onSelect={setSelectedKey} />
        }
        thirdLabel="V3 live bulletin (slot-text)"
      />

      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-medium">V3 focus — live bulletin</h3>
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Shows the active hook tool call with formatted labels. Each metadata
          update rolls in with{' '}
          <code className="font-mono text-[11px]">slot-text</code>. When no tool
          is running, the card falls back to recap text.
        </p>
        <div className="flex flex-wrap items-start gap-6">
          <MockColumnShell count={2} label="Working">
            <WorkingSessionCardV3
              card={{ ...liveCard, selected: false }}
              onSelect={setSelectedKey}
            />
            <WorkingSessionCardV3
              card={{ ...claudeCard, selected: false }}
              onSelect={setSelectedKey}
            />
          </MockColumnShell>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-medium">Unselected state</h3>
        <div className="flex flex-wrap items-start gap-6">
          <MockColumnShell count={2} label="Working">
            <KanbanCard
              card={{ ...liveWorkingCard, selected: false }}
              onSelect={setSelectedKey}
            />
            <WorkingSessionCardV2
              card={{ ...liveWorkingCard, selected: false }}
              onSelect={setSelectedKey}
            />
          </MockColumnShell>
        </div>
      </section>
    </div>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkingSessionCardMockPage />
  </StrictMode>
);
