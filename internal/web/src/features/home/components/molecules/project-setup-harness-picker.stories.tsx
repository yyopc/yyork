import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ProjectSetupCardShell } from '@/features/home/components/molecules/project-setup-card-shell';
import { HarnessPickerDemo } from '@/features/home/components/molecules/project-setup-harness-picker-demo';
import { FirstRunProjectCard } from '@/features/home/components/organisms/first-run-project-card';

const meta = {
  title: 'Home/ProjectSetupHarnessPicker',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const FirstRunEmbeddedDark: Story = {
  render: () => (
    <div className="dark flex h-[640px] bg-background font-sans text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6">
        <ProjectSetupCardShell data-testid="project-setup-card">
          <HarnessPickerDemo />
        </ProjectSetupCardShell>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Agents' })).toBeVisible();
    await expect(canvas.getByText('~/Projects/reverbcode')).toBeVisible();
    await expect(canvas.getByText('Orchestrator agent')).toBeVisible();
    await expect(canvas.getByText('Worker agent')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Start project' })
    ).toBeEnabled();
  },
};

export const FirstRunEmbeddedLight: Story = {
  render: () => (
    <div className="flex h-[640px] bg-background font-sans text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6">
        <ProjectSetupCardShell>
          <HarnessPickerDemo />
        </ProjectSetupCardShell>
      </div>
    </div>
  ),
};

export const WithGlobalDefaultsPreselected: Story = {
  render: () => (
    <div className="dark flex min-h-[760px] items-center justify-center bg-background p-6 font-sans text-foreground">
      <ProjectSetupCardShell>
        <HarnessPickerDemo
          defaultOrchestrator="codex"
          defaultRememberOrchestrator
          defaultRememberWorker
          defaultWorker="codex"
        />
      </ProjectSetupCardShell>
    </div>
  ),
};

export const DialogModeDark: Story = {
  render: function DialogModeStory() {
    const [open, setOpen] = useState(true);

    return (
      <div className="dark flex min-h-[760px] bg-background font-sans text-foreground">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="max-w-[440px] gap-0 overflow-hidden p-0 sm:max-w-[440px]"
            showCloseButton={false}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Agents</DialogTitle>
              <DialogDescription>
                Choose orchestrator and worker agents for this project.
              </DialogDescription>
            </DialogHeader>
            <HarnessPickerDemo
              projectPath="~/Projects/yyork"
              showCancel
              onCancel={() => {
                setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
  },
};

export const Starting: Story = {
  render: () => (
    <div className="dark flex min-h-[760px] items-center justify-center bg-background p-6 font-sans text-foreground">
      <ProjectSetupCardShell>
        <HarnessPickerDemo starting />
      </ProjectSetupCardShell>
    </div>
  ),
};

/**
 * First-run flow: the same centered card shell morphs from the teaching empty
 * state into harness setup after folder selection (folder picker is native/OS).
 */
export const EmptyStateToSetupEvolution: Story = {
  render: function EmptyStateToSetupEvolutionStory() {
    const [phase, setPhase] = useState<'empty' | 'agents'>('empty');

    return (
      <div className="dark relative flex min-h-[760px] bg-background font-sans text-foreground">
        <FirstRunProjectCard
          phase={phase}
          projectPath="~/Projects/reverbcode"
          onAddProject={() => {
            setPhase('agents');
          }}
          onChangeProject={() => {
            setPhase('empty');
          }}
          onStartProject={() => undefined}
        />
        {phase === 'empty' ? (
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
            Story control: click + in the preview to advance to setup
          </p>
        ) : null}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'No projects yet' })
    ).toBeVisible();
    const addButtons = canvas.getAllByRole('button', { name: 'Add project' });
    await userEvent.click(addButtons[1] ?? addButtons[0]!);
    await expect(canvas.getByRole('heading', { name: 'Agents' })).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Change project' })
    );
    await expect(
      canvas.getByRole('heading', { name: 'No projects yet' })
    ).toBeVisible();
  },
};
