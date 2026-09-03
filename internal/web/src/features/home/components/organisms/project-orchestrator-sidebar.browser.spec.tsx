import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';
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
  onAddProject?: () => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  pinnedTerminalSessionKeys?: string[];
}) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <StickySidebarContents {...props} />,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <div>Settings destination</div>,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
  });

  return <RouterProvider router={router} />;
}

function StickySidebarContents(props: {
  onAddProject?: () => void;
  onTerminalSessionOpenDetached?: (selectionKey: string) => void;
  onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
  pinnedTerminalSessionKeys?: string[];
}) {
  const sessions = makeStickyOverflowSessions();
  const [openWorkerSessionGroupIdsByProject, setOpenWorkerSessionGroupIds] =
    useState<Partial<Record<string, WorkerSessionState[]>>>(() =>
      Object.fromEntries(
        stickyProjects
          .slice(0, 1)
          .map((project) => [project.id, [...workerStates]])
      )
    );

  return (
    <SidebarProvider defaultOpen className="[--sidebar-width:13rem]">
      <ProjectOrchestratorSidebar
        activeBoardProjectId={stickyProjects[0]?.id}
        onAddProject={props.onAddProject ?? (() => {})}
        onOrchestratorSessionSelect={() => {}}
        onProjectBoardSelect={() => {}}
        onProjectDelete={() => {}}
        onProjectOpenChange={() => {}}
        onProjectRename={() => {}}
        onTerminalSessionDelete={() => {}}
        onTerminalSessionMarkDone={props.onTerminalSessionMarkDone}
        onTerminalSessionOpenDetached={props.onTerminalSessionOpenDetached}
        onTerminalSessionPinToggle={() => {}}
        onTerminalSessionRename={() => {}}
        onWorkerSessionGroupOpenChange={(projectId, groupId, open) => {
          setOpenWorkerSessionGroupIds((currentGroupIdsByProject) => {
            const currentGroupIds =
              currentGroupIdsByProject[projectId] ?? workerStates;

            return {
              ...currentGroupIdsByProject,
              [projectId]: open
                ? Array.from(new Set([...currentGroupIds, groupId]))
                : currentGroupIds.filter(
                    (currentGroupId) => currentGroupId !== groupId
                  ),
            };
          });
        }}
        onWorkerSessionSelect={() => {}}
        openProjectIds={stickyProjects.map((project) => project.id)}
        openWorkerSessionGroupIdsByProject={openWorkerSessionGroupIdsByProject}
        orchestrators={[]}
        pinnedProjectIds={[]}
        pinnedTerminalSessionKeys={props.pinnedTerminalSessionKeys ?? []}
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
    onAddProject?: () => void;
    onTerminalSessionOpenDetached?: (selectionKey: string) => void;
    onTerminalSessionMarkDone?: (selectionKey: string, label: string) => void;
    pinnedTerminalSessionKeys?: string[];
  } = {}
) {
  await page.viewport(1024, 768);
  const renderResult = render(<StickySidebarHarness {...props} />);
  await expect
    .element(page.getByRole('navigation', { name: 'Projects' }))
    .toBeVisible();

  return renderResult;
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

function getPinnedGroupContent() {
  const pinnedNav = document.querySelector<HTMLElement>(
    '[role="navigation"][aria-label="Pinned"]'
  );

  if (!pinnedNav) {
    throw new Error('Expected Pinned navigation to render.');
  }

  const groupContent = pinnedNav.querySelector<HTMLElement>(
    '[data-sidebar="group-content"]'
  );

  expect(groupContent).toBeTruthy();
  return groupContent as HTMLElement;
}

function getNavButton(navLabel: string, buttonLabel: string) {
  const nav = document.querySelector<HTMLElement>(
    `[role="navigation"][aria-label="${navLabel}"]`
  );

  if (!nav) {
    throw new Error(`Expected ${navLabel} navigation to render.`);
  }

  const button = nav.querySelector<HTMLButtonElement>(
    `button[aria-label="${buttonLabel}"]`
  );

  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getProjectWorkerGroupToggle(projectName: string, groupLabel: string) {
  const projectButton = getNavButton('Projects', `Open ${projectName} board`);
  const projectItem = projectButton.closest<HTMLElement>(
    '[data-sidebar="menu-item"]'
  );
  const groupToggle = projectItem?.querySelector<HTMLButtonElement>(
    `button[aria-label$="${groupLabel} sessions"]`
  );

  expect(groupToggle).toBeTruthy();
  return groupToggle as HTMLButtonElement;
}

function hasActiveMaskImage(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const maskImages = [
    styles.maskImage,
    styles.getPropertyValue('-webkit-mask-image'),
  ].filter(Boolean);

  return maskImages.some(
    (maskImage) => maskImage !== 'none' && maskImage.includes('gradient')
  );
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

function getReferenceColor(className: string) {
  const reference = document.createElement('span');
  reference.className = className;
  document.body.append(reference);
  const color = getComputedStyle(reference).color;
  reference.remove();
  return color;
}

test('starts Pinned and Projects expanded on every mount with accessible triggers', async () => {
  const user = setupUser();
  const renderResult = await renderDesktopStickySidebar();
  const pinnedTrigger = page.getByRole('button', {
    name: 'Toggle Pinned section',
  });
  const projectsTrigger = page.getByRole('button', {
    name: 'Toggle Projects section',
  });

  await expect.element(pinnedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'true');
  await expect
    .element(page.getByRole('button', { name: 'No pinned sessions' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Open Sticky Alpha board' }))
    .toBeVisible();

  await user.click(pinnedTrigger);
  await user.click(projectsTrigger);
  renderResult.unmount();

  await renderDesktopStickySidebar();
  await expect.element(pinnedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'true');
});

test('toggles Pinned and Projects independently and releases the Projects flex height', async () => {
  const user = setupUser();
  await renderDesktopStickySidebar();
  const pinnedTrigger = page.getByRole('button', {
    name: 'Toggle Pinned section',
  });
  const projectsTrigger = page.getByRole('button', {
    name: 'Toggle Projects section',
  });
  const projectsNav = page
    .getByRole('navigation', {
      name: 'Projects',
    })
    .element();

  expect(Number(getComputedStyle(projectsNav).flexGrow)).toBeGreaterThan(0);

  await user.click(pinnedTrigger);
  await expect.element(pinnedTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'true');
  await expect
    .element(page.getByRole('button', { name: 'No pinned sessions' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Open Sticky Alpha board' }))
    .toBeVisible();

  await user.click(projectsTrigger);
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'false');
  await expect
    .element(page.getByRole('button', { name: 'Open Sticky Alpha board' }))
    .not.toBeInTheDocument();
  expect(Number(getComputedStyle(projectsNav).flexGrow)).toBe(0);

  await user.click(pinnedTrigger);
  await expect.element(pinnedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'false');
  await expect
    .element(page.getByRole('button', { name: 'No pinned sessions' }))
    .toBeVisible();
});

test('keeps Add project available without changing the Projects expanded state', async () => {
  const user = setupUser();
  let addProjectCallCount = 0;
  await renderDesktopStickySidebar({
    onAddProject: () => {
      addProjectCallCount += 1;
    },
  });
  const projectsTrigger = page.getByRole('button', {
    name: 'Toggle Projects section',
  });
  const addProjectButton = page.getByRole('button', { name: 'Add project' });

  await user.click(projectsTrigger);
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'false');
  await expect.element(addProjectButton).toBeVisible();

  await user.click(addProjectButton);

  expect(addProjectCallCount).toBe(1);
  await expect
    .element(projectsTrigger)
    .toHaveAttribute('aria-expanded', 'false');
});

test('places subtle section chevrons beside labels and reveals them on hover and keyboard focus', async () => {
  const user = setupUser();
  await renderDesktopStickySidebar();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sectionLabels = ['Pinned', 'Projects'] as const;
  const triggers = sectionLabels.map((label) =>
    page.getByRole('button', { name: `Toggle ${label} section` })
  );

  for (const [index, trigger] of triggers.entries()) {
    const label = sectionLabels[index];
    const triggerElement = trigger.element();
    const labelElement = triggerElement.querySelector('span');
    const chevron = triggerElement.querySelector('svg');

    expect(labelElement?.textContent).toBe(label);
    expect(labelElement?.nextElementSibling).toBe(chevron);
    expect(chevron).toBeTruthy();
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(chevron as SVGElement).opacity).toBe('0');
    expect(getComputedStyle(chevron as SVGElement).transitionDuration).toBe(
      reducedMotion ? '0s' : '0.15s'
    );

    const labelRect = (labelElement as HTMLElement).getBoundingClientRect();
    const chevronRect = (chevron as SVGElement).getBoundingClientRect();
    expect(chevronRect.left).toBeGreaterThanOrEqual(labelRect.right);
    expect(chevronRect.left - labelRect.right).toBeLessThanOrEqual(4);

    await trigger.hover();
    expect(triggerElement.matches(':hover')).toBe(true);
    await expect
      .poll(() => Number(getComputedStyle(chevron as SVGElement).opacity))
      .toBeGreaterThan(0);
    await trigger.unhover();
    await expect
      .poll(() => getComputedStyle(chevron as SVGElement).opacity)
      .toBe('0');
  }

  const addProjectButton = page.getByRole('button', { name: 'Add project' });

  for (const [index, trigger] of triggers.entries()) {
    const triggerElement = trigger.element();
    const chevron = triggerElement.querySelector('svg') as SVGElement;
    const followingFocusableElement =
      index === 0 ? triggers[1]?.element() : addProjectButton.element();

    if (!followingFocusableElement) {
      throw new Error('Expected a control after the section trigger.');
    }

    followingFocusableElement.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(triggerElement);
    await expect
      .poll(() => Number(getComputedStyle(chevron).opacity))
      .toBeGreaterThan(0);

    const expandedRotation = getComputedStyle(chevron).rotate;
    await user.keyboard('{Enter}');
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(triggerElement.hasAttribute('data-panel-open')).toBe(false);
    await expect
      .poll(() => getComputedStyle(chevron).rotate)
      .not.toBe(expandedRotation);
  }
});

test('uses the scroll fade affordance only on the projects scroller', async () => {
  await renderDesktopStickySidebar();

  const scrollArea = getProjectsScrollArea();
  await vi.waitFor(() => {
    expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight);
    expect(hasActiveMaskImage(scrollArea)).toBe(true);
  });

  expect(scrollArea.classList.contains('scroll-fade-y')).toBe(true);
  expect(scrollArea.classList.contains('scroll-fade-6')).toBe(true);
  expect(
    scrollArea.classList.contains(
      '[--scroll-fade-reveal:calc(var(--spacing)*6)]'
    )
  ).toBe(true);
  expect(getPinnedGroupContent().classList.contains('scroll-fade-y')).toBe(
    false
  );
});

test('keeps the scroll-fade animation off the Projects collapsible panel', async () => {
  const user = setupUser();
  await renderDesktopStickySidebar();
  const projectsNav = page
    .getByRole('navigation', { name: 'Projects' })
    .element();
  const projectsPanel = projectsNav.querySelector<HTMLElement>(
    '[data-slot="collapsible-content"]'
  );
  const scrollArea = getProjectsScrollArea();

  expect(projectsPanel).toBeTruthy();
  expect(projectsPanel).not.toBe(scrollArea);
  expect(getComputedStyle(projectsPanel as HTMLElement).animationName).toBe(
    'none'
  );

  await user.click(
    page.getByRole('button', { name: 'Toggle Projects section' })
  );

  await vi.waitFor(() => {
    expect(projectsPanel?.isConnected).toBe(false);
  });
});

test('keeps matching worker state groups independently controllable across projects', async () => {
  const user = setupUser();
  await renderDesktopStickySidebar();

  expect(getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt').ariaLabel).toBe(
    'Collapse Prompt sessions'
  );
  expect(getProjectWorkerGroupToggle('Sticky Beta', 'Prompt').ariaLabel).toBe(
    'Collapse Prompt sessions'
  );

  await user.click(getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt'));

  await vi.waitFor(() => {
    expect(
      getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt').ariaLabel
    ).toBe('Expand Prompt sessions');
    expect(getProjectWorkerGroupToggle('Sticky Beta', 'Prompt').ariaLabel).toBe(
      'Collapse Prompt sessions'
    );
  });

  await user.click(getProjectWorkerGroupToggle('Sticky Beta', 'Prompt'));

  await vi.waitFor(() => {
    expect(
      getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt').ariaLabel
    ).toBe('Expand Prompt sessions');
    expect(getProjectWorkerGroupToggle('Sticky Beta', 'Prompt').ariaLabel).toBe(
      'Expand Prompt sessions'
    );
  });

  await user.click(getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt'));

  await vi.waitFor(() => {
    expect(
      getProjectWorkerGroupToggle('Sticky Alpha', 'Prompt').ariaLabel
    ).toBe('Collapse Prompt sessions');
    expect(getProjectWorkerGroupToggle('Sticky Beta', 'Prompt').ariaLabel).toBe(
      'Expand Prompt sessions'
    );
  });
});

test('opens the footer settings menu and navigates from its Settings action', async () => {
  const user = setupUser();
  await renderDesktopStickySidebar();

  const settingsTrigger = page.getByRole('button', { name: 'Settings' });
  await user.click(settingsTrigger);

  const settingsAction = page.getByRole('menuitem', { name: 'Settings' });
  await expect.element(settingsAction).toBeVisible();
  await expect.element(settingsTrigger).toBeVisible();

  await user.click(settingsAction);
  await expect.element(page.getByText('Settings destination')).toBeVisible();
});

test('changes the theme from the footer menu with pointer and keyboard input', async () => {
  const user = setupUser();
  const previousTheme = localStorage.getItem('theme');
  localStorage.setItem('theme', 'system');

  try {
    await renderDesktopStickySidebar();
    await user.click(page.getByRole('button', { name: 'Settings' }));

    const themeSelect = page.getByRole('combobox', { name: 'Theme' });
    await user.click(themeSelect);
    const lightOption = page.getByRole('option', { name: 'Light' });
    await user.click(lightOption);
    expect(localStorage.getItem('theme')).toBe('light');
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'false');

    await user.click(themeSelect);
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(localStorage.getItem('theme')).not.toBe('light');
    await expect.element(themeSelect).toHaveAttribute('aria-expanded', 'false');

    await user.click(themeSelect);
    await user.click(page.getByRole('option', { name: 'Dark' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  } finally {
    if (previousTheme === null) {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', previousTheme);
    }
  }
});

test('matches pinned worker row font size to project worker rows', async () => {
  await renderDesktopStickySidebar({
    pinnedTerminalSessionKeys: ['sticky-alpha:sticky-alpha-prompt-0'],
  });

  const pinnedWorkerRow = getNavButton(
    'Pinned',
    'open the worker session: sticky-alpha-prompt-0'
  );
  const projectWorkerRow = getNavButton(
    'Projects',
    'Open prompt worker 2 terminal'
  );

  expect(getComputedStyle(pinnedWorkerRow).fontSize).toBe(
    getComputedStyle(projectWorkerRow).fontSize
  );
});

test('uses muted foreground for unselected agent session rows', async () => {
  await renderDesktopStickySidebar({
    pinnedTerminalSessionKeys: ['sticky-alpha:sticky-alpha-prompt-0'],
  });

  const mutedForeground = getReferenceColor('text-muted-foreground');
  const pinnedWorkerRow = getNavButton(
    'Pinned',
    'open the worker session: sticky-alpha-prompt-0'
  );
  const projectWorkerRow = getNavButton(
    'Projects',
    'Open prompt worker 2 terminal'
  );
  const selectedProjectWorkerRow = getNavButton(
    'Projects',
    'Open working worker 1 terminal'
  );

  expect(getComputedStyle(pinnedWorkerRow).color).toBe(mutedForeground);
  expect(getComputedStyle(projectWorkerRow).color).toBe(mutedForeground);
  expect(selectedProjectWorkerRow.hasAttribute('data-active')).toBe(true);
  expect(getComputedStyle(selectedProjectWorkerRow).color).not.toBe(
    mutedForeground
  );
});

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
  const onOpenDetached = vi.fn();
  const onMarkDone = vi.fn();
  await renderDesktopStickySidebar({
    onTerminalSessionMarkDone: onMarkDone,
    onTerminalSessionOpenDetached: onOpenDetached,
  });

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
  await expect
    .element(page.getByRole('menuitem', { name: 'Detach terminal' }))
    .toBeVisible();
  await user.click(page.getByRole('menuitem', { name: 'Detach terminal' }));
  expect(onOpenDetached).toHaveBeenCalledWith(
    'sticky-alpha:sticky-alpha-prompt-0'
  );

  getButtonByAriaLabel('Open prompt worker 1 terminal').dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
    })
  );
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
    .element(page.getByRole('menuitem', { exact: true, name: 'Open terminal' }))
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
