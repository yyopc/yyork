import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { KanbanBoard } from '@/features/home/components/organisms/kanban-board';
import {
  emptyKanbanColumns,
  sampleKanbanColumns,
} from '@/features/home/demo/session-workspace.fixtures';

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
