import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { NoProjectsEmptyState } from '@/features/home/components/organisms/no-projects-empty-state';

const meta = {
  title: 'Home/NoProjectsEmptyState',
  component: NoProjectsEmptyState,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof NoProjectsEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  args: {
    onAddProject: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="flex h-[640px] bg-background font-sans text-foreground">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'No projects yet' })
    ).toBeVisible();
    await expect(
      canvas.getAllByRole('button', { name: 'Add project' })
    ).toHaveLength(2);
  },
};

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div className="dark flex h-[640px] bg-background font-sans text-foreground">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'No projects yet' })
    ).toBeVisible();
  },
};
