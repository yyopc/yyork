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
    await expect(canvas.getByRole('img', { name: 'Codex' })).toBeVisible();
    await expect(canvas.getByText('Split PR decision')).toBeVisible();
    await expect(
      canvas.getByText('Waiting for your answer on the split strategy.')
    ).toBeVisible();
  },
};

export const Claude: Story = {
  args: {
    card: sampleKanbanCards.claude,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('img', { name: 'Claude Code' })
    ).toBeVisible();
    await expect(canvas.getByText('Trace branch metadata')).toBeVisible();
  },
};

export const Selected: Story = {
  args: {
    card: sampleKanbanCards.selectedCodex,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Tell me about this project')).toBeVisible();
    await expect(
      canvas.getByText('Scanning README and package manifests for an overview.')
    ).toBeVisible();
    await expect(canvas.getByText('n-ao-2')).toBeVisible();
  },
};

export const WithoutRecap: Story = {
  args: {
    card: {
      ...sampleKanbanCards.selectedCodex,
      currentLine: '',
      description: '',
      recap: '',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Tell me about this project')).toBeVisible();
    await expect(
      canvas.queryByText('Scanning README and package manifests for an overview.')
    ).toBeNull();
  },
};
