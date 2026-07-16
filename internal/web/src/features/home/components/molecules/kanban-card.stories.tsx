import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, within } from 'storybook/test';

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
      <div className="w-[266px] bg-background font-sans text-foreground">
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
    await expect(
      canvas.getByRole('button', { name: /Response delivered/ })
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
    await expect(canvas.getByText('Read · README.md')).toBeVisible();
    await expect(canvas.getByText('n-ao-2')).toBeVisible();
  },
};

export const WorkingWithToolCall: Story = {
  args: {
    card: sampleKanbanCards.claude,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Trace branch metadata')).toBeVisible();
    await expect(
      canvas.getByText(
        'Shell · rg branch internal internal/web/src/features/home'
      )
    ).toBeVisible();
  },
};

export const WithoutRecap: Story = {
  args: {
    card: {
      ...sampleKanbanCards.selectedCodex,
      currentLine: '',
      description: '',
      descriptionLines: [],
      recap: '',
      recapPreview: '',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Tell me about this project')).toBeVisible();
    await expect(canvas.queryByText('Reading file: README.md')).toBeNull();
  },
};

export const WithSessionContextMenu: Story = {
  args: {
    card: sampleKanbanCards.codex,
    onSelect: () => {},
    onTerminalSessionDelete: () => {},
    onTerminalSessionPinToggle: () => {},
    onTerminalSessionRename: () => {},
    pinnedTerminalSessionKeys: [sampleKanbanCards.codex.selectionKey],
  },
  play: async ({ canvas, canvasElement }) => {
    const card = canvas.getByRole('button', {
      name: /Codex session .*: Split PR decision/i,
    });

    card.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        buttons: 2,
        cancelable: true,
      })
    );

    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole('menuitem', { name: 'Unpin' })).toBeVisible();
    await expect(
      body.getByRole('menuitem', { name: /^Open terminal$/ })
    ).toBeVisible();
    await expect(body.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await expect(
      body.getByRole('menuitem', { name: 'Stop session' })
    ).toBeVisible();
  },
};
