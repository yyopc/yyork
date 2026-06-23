import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { OpenIdeButton } from '@/features/home/components/molecules/open-ide-button';

const meta = {
  title: 'Home/Open IDE Button',
  component: OpenIdeButton,
  args: {
    session: {
      cwd: '/Users/tanishqpalandurkar/Projects/yyork',
      id: 'ao-1',
      project: 'yyork',
      title: 'Live worker',
    },
  },
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="bg-background p-3 font-sans text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OpenIdeButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Open IDE' })
    ).toBeVisible();
  },
};
