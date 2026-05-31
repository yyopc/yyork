import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { KanbanCard } from '@/features/home/components/molecules/kanban-card';
import { sampleKanbanCards } from '@/features/home/demo/session-workspace.fixtures';

const meta = {
  title: 'Home/Kanban/Card',
  component: KanbanCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-[266px] bg-background font-mono text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KanbanCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Codex: Story = {
  args: {
    card: sampleKanbanCards.codex,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('[codex/metadata]')).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Trace branch metadata' })
    ).toBeVisible();
  },
};

export const Claude: Story = {
  args: {
    card: sampleKanbanCards.claude,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('[claude/metadata]')).toBeVisible();
  },
};

export const Selected: Story = {
  args: {
    card: sampleKanbanCards.selectedCodex,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('[AO-2]')).toBeVisible();
  },
};
