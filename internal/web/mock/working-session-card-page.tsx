import { useState } from 'react';

import { KanbanCard } from '@/features/home/components/molecules/kanban-card';

import { ComparisonPanel } from './comparison-panel';
import { MockColumnShell } from './mock-column-shell';
import {
  claudeWorkingCard,
  liveWorkingCard,
} from './working-session-card-fixtures';
import { WorkingSessionCardV2 } from './working-session-card-v2';
import { WorkingSessionCardV3 } from './working-session-card-v3';

export function WorkingSessionCardMockPage() {
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
