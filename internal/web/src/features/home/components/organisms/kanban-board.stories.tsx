import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { KanbanBoard } from '@/features/home/components/organisms/kanban-board';
import {
  emptyKanbanColumns,
  sampleKanbanCards,
  sampleKanbanColumns,
} from '@/features/home/demo/session-workspace.fixtures';
import type { KanbanColumnData } from '@/features/home/domain/session-workspace';

const meta = {
  title: 'Home/Kanban/Board',
  component: KanbanBoard,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-[640px] bg-background font-sans text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KanbanBoard>;

export default meta;

type Story = StoryObj<typeof meta>;

const overflowPromptTasks = [
  'Terminal Scroll Verification',
  'Investigate Codex TUI Scroll Routing in yyork Managed Terminal',
  'fix select to copy in zellij backed sessions',
  'Use the $investigate workflow to root-cause Codex hook failures',
  'Use the $investigate workflow to root-cause this yyork IAB bug',
  'Use the $investigate workflow to root-cause this yyork UI bug',
  'Explain the current state of agent hooks in yyork',
  'Audit worker title generation after native hook updates',
  'Verify sidebar visibility filtering with hidden sessions',
];

const overflowKanbanColumns: KanbanColumnData[] = sampleKanbanColumns.map(
  (column) => {
    if (column.id !== 'prompt') {
      return column;
    }

    const sourceCard = sampleKanbanCards.codex;
    return {
      ...column,
      cards: overflowPromptTasks.map((task, index) => {
        return {
          ...sourceCard,
          id: `${sourceCard.id}-overflow-${index}`,
          selected: index === 4,
          selectionKey: `${sourceCard.selectionKey}-overflow-${index}`,
          shortId: `x${index.toString(36).padStart(4, '0')}`,
          task,
        };
      }),
    };
  }
);

export const Default: Story = {
  args: {
    columns: sampleKanbanColumns,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('region', { name: 'Kanban board' })
    ).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Working' })
    ).toBeVisible();
    await expect(canvas.getByText('[codex/metadata]')).toBeVisible();
  },
};

export const Empty: Story = {
  args: {
    columns: emptyKanbanColumns,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Working' })
    ).toBeVisible();
    await expect(canvas.getAllByText('0')).toHaveLength(4);
  },
};

export const PromptColumnOverflow: Story = {
  args: {
    className: 'h-full',
    columns: overflowKanbanColumns,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('region', { name: 'Kanban board' })
    ).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Prompt' })).toBeVisible();
    await expect(canvas.getByText('9')).toBeVisible();
    await expect(
      canvas.getByText(
        'Use the $investigate workflow to root-cause this yyork IAB bug'
      )
    ).toBeVisible();
  },
};
