import { expect, test, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';

import {
  getWorkerSessionGroups,
  getWorkerSessionSelectionKey,
  type ProjectOrchestrator,
  type WorkerSession,
  type WorkerSessionState,
} from '@/features/home/domain/session-workspace';
import { page, render, setupUser } from '@/tests/utils';

import { ProjectOrchestratorSidebar } from './project-orchestrator-sidebar';

vi.mock(
  '@/features/home/components/molecules/history-navigation-buttons',
  () => ({
    HistoryNavigationButtons: () => null,
  })
);

const stickyProjects: ProjectOrchestrator[] = [
  {
    id: 'sticky-alpha',
    name: 'Sticky Alpha',
    path: '/Users/tanishqpalandurkar/Projects/sticky-alpha',
    workerWorkspaceMode: 'local',
  },
  {
    id: 'sticky-beta',
    name: 'Sticky Beta',
    path: '/Users/tanishqpalandurkar/Projects/sticky-beta',
    workerWorkspaceMode: 'local',
  },
];

const workerStates: WorkerSessionState[] = [
  'working',
  'prompt',
  'triage',
  'done',
];

function makeStickyOverflowSessions() {
  return stickyProjects.flatMap((project) =>
    workerStates.flatMap((state) =>
      Array.from({ length: 10 }, (_, index) =>
        makeWorkerSession(project.id, state, index)
      )
    )
  );
}

function makeWorkerSession(
  projectId: string,
  state: WorkerSessionState,
  index: number
): WorkerSession {
  const id = `${projectId}-${state}-${index}`;
  const label = `${state} worker ${index + 1}`;

  return {
    agent: 'codex',
    description: `Working on ${label}`,
    id,
    issue: `Issue ${index + 1}`,
    kind: 'worker',
    metadata: JSON.stringify({ title: label }),
    project: projectId,
    recap: `Recap for ${label}`,
    state,
    terminalSupported: true,
    title: label,
    workerId: id,
  };
}

function StickySidebarHarness(props: {
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
}) {
  const sessions = makeStickyOverflowSessions();

  return (
    <SidebarProvider defaultOpen className="[--sidebar-width:13rem]">
      <ProjectOrchestratorSidebar
        activeBoardProjectId={stickyProjects[0]?.id}
        onAddProject={() => {}}
        onOrchestratorSessionSelect={() => {}}
        onProjectBoardSelect={() => {}}
        onProjectDelete={() => {}}
        onProjectOpenChange={() => {}}
        onProjectRename={() => {}}
        onTerminalSessionDelete={() => {}}
        onTerminalSessionHide={() => {}}
        onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
        onTerminalSessionPinToggle={() => {}}
        onTerminalSessionRename={() => {}}
        onWorkerSessionGroupOpenChange={() => {}}
        onWorkerSessionSelect={() => {}}
        openProjectIds={stickyProjects.map((project) => project.id)}
        openWorkerSessionGroupIds={workerStates}
        orchestrators={[]}
        pinnedProjectIds={[]}
        pinnedTerminalSessionKeys={[]}
        projects={stickyProjects}
        selectedProjectId={stickyProjects[0]?.id ?? ''}
        selectedTerminalSessionKey={
          sessions[0] ? getWorkerSessionSelectionKey(sessions[0]) : undefined
        }
        workerSessionGroups={getWorkerSessionGroups(sessions)}
      />
    </SidebarProvider>
  );
}

async function renderDesktopStickySidebar(
  props: {
    onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  } = {}
) {
  await page.viewport(1024, 768);
  render(<StickySidebarHarness {...props} />);
}

function getButtonByAriaLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );

  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getProjectsScrollArea() {
  const projectsNav = document.querySelector<HTMLElement>(
    '[role="navigation"][aria-label="Projects"]'
  );

  if (!projectsNav) {
    throw new Error('Expected Projects navigation to render.');
  }

  const scrollArea = projectsNav.querySelector<HTMLElement>(
    '[data-sidebar="group-content"]'
  );

  expect(scrollArea).toBeTruthy();
  return scrollArea as HTMLElement;
}

function getStickyContexts() {
  const scrollArea = getProjectsScrollArea();
  const projects = Array.from(
    scrollArea.querySelectorAll<HTMLElement>(
      '[data-sidebar-sticky-context="project"]'
    )
  );
  const groups = Array.from(
    scrollArea.querySelectorAll<HTMLElement>(
      '[data-sidebar-sticky-context="worker-group"]'
    )
  );

  expect(projects.length).toBeGreaterThanOrEqual(2);
  expect(groups.length).toBeGreaterThanOrEqual(workerStates.length);

  return { groups, projects, scrollArea };
}

function requireStickyContext(
  contexts: HTMLElement[],
  index: number,
  label: string
) {
  const context = contexts[index];

  if (!context) {
    throw new Error(`Expected sticky ${label} context at index ${index}.`);
  }

  return context;
}

function isOpaque(element: HTMLElement) {
  return getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)';
}

test('keeps the project and worker group contexts sticky while sessions scroll', async () => {
  await renderDesktopStickySidebar();

  const { groups, projects, scrollArea } = getStickyContexts();
  await vi.waitFor(() => {
    expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight);
  });

  const projectContext = requireStickyContext(projects, 0, 'project');
  const workerGroupContext = requireStickyContext(groups, 0, 'worker group');

  expect(getComputedStyle(projectContext).position).toBe('sticky');
  expect(getComputedStyle(workerGroupContext).position).toBe('sticky');
  expect(isOpaque(projectContext)).toBe(true);
  expect(isOpaque(workerGroupContext)).toBe(true);
  expect(Number(getComputedStyle(projectContext).zIndex)).toBeGreaterThan(
    Number(getComputedStyle(workerGroupContext).zIndex)
  );

  scrollArea.scrollTop = 180;
  scrollArea.dispatchEvent(new Event('scroll', { bubbles: true }));

  await vi.waitFor(() => {
    const scrollAreaTop = scrollArea.getBoundingClientRect().top;
    const projectRect = projectContext.getBoundingClientRect();
    const workerGroupRect = workerGroupContext.getBoundingClientRect();

    expect(Math.abs(projectRect.top - scrollAreaTop)).toBeLessThanOrEqual(1);
    expect(workerGroupRect.top).toBeGreaterThanOrEqual(projectRect.bottom - 1);
    expect(
      Math.abs(workerGroupRect.top - projectRect.bottom)
    ).toBeLessThanOrEqual(1);
  });
});

test('shows mark done only for prompt worker rows', async () => {
  const user = setupUser();
  const onMarkDone = vi.fn();
  await renderDesktopStickySidebar({ onTerminalSessionMarkDone: onMarkDone });

  getButtonByAriaLabel('Open prompt worker 1 terminal').dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );

  await expect
    .element(page.getByRole('menuitem', { name: 'Mark done' }))
    .toBeVisible();
  await user.click(page.getByRole('menuitem', { name: 'Mark done' }));
  expect(onMarkDone).toHaveBeenCalledWith(
    'sticky-alpha:sticky-alpha-prompt-0',
    'prompt worker 1'
  );

  getButtonByAriaLabel('Open working worker 1 terminal').dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );

  await expect
    .element(page.getByRole('menuitem', { name: 'Open terminal' }))
    .toBeVisible();
  expect(page.getByRole('menuitem', { name: 'Mark done' }).query()).toBeNull();
});

test('lets the next project row take over when its own sessions reach the top', async () => {
  await renderDesktopStickySidebar();

  const { projects, scrollArea } = getStickyContexts();
  await vi.waitFor(() => {
    expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight);
  });

  const firstProjectContext = requireStickyContext(projects, 0, 'project');
  const secondProjectContext = requireStickyContext(projects, 1, 'project');
  const secondProjectOffset =
    secondProjectContext.getBoundingClientRect().top -
    scrollArea.getBoundingClientRect().top +
    scrollArea.scrollTop;
  scrollArea.scrollTop = secondProjectOffset + 120;
  scrollArea.dispatchEvent(new Event('scroll', { bubbles: true }));

  await vi.waitFor(() => {
    const scrollAreaTop = scrollArea.getBoundingClientRect().top;
    const firstProjectRect = firstProjectContext.getBoundingClientRect();
    const secondProjectRect = secondProjectContext.getBoundingClientRect();

    expect(firstProjectRect.bottom).toBeLessThanOrEqual(scrollAreaTop + 1);
    expect(Math.abs(secondProjectRect.top - scrollAreaTop)).toBeLessThanOrEqual(
      1
    );
  });
});
