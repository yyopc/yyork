import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { KanbanColumn } from '@/features/home/components/organisms/kanban-column';
import {
  doneKanbanColumn,
  triageKanbanColumn,
  workingKanbanColumn,
} from '@/features/home/demo/session-workspace.fixtures';

const meta = {
  title: 'Home/Kanban/Column',
  component: KanbanColumn,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="h-[560px] w-[274px] border border-border bg-background font-mono text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KanbanColumn>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WorkingPopulated: Story = {
  args: {
    column: workingKanbanColumn,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Working' })
    ).toBeVisible();
    await expect(canvas.getByText('2')).toBeVisible();
  },
};

export const TriageDense: Story = {
  args: {
    column: triageKanbanColumn,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Triage' })).toBeVisible();
    await expect(canvas.getByText('4')).toBeVisible();
  },
};

export const DoneEmpty: Story = {
  args: {
    column: doneKanbanColumn,
    isLast: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Done' })).toBeVisible();
    await expect(canvas.getByText('0')).toBeVisible();
  },
};
